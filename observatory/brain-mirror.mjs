#!/usr/bin/env node
/**
 * brain-mirror.mjs — Model B / C2 大脑仓 git 镜像（零 npm 依赖）。
 *
 * 职责（docs/designs/2026-09-12-平台独立部署演进-技术方案.md §2 知识面）：
 *   - 平台持有大脑仓 git 镜像：clone（缺席时）+ fetch + ff-only 合并——镜像只做只读展示的同步；
 *   - 知识升级 = 镜像内 commit + push（git 为权威，多副本经远端 git 同步）；
 *   - 冲突策略：远端分叉 / push 被拒 → 回滚本地提交并**拒写**（呈报主人，不静默强推、不自动改历史）。
 *
 * 凭据（§4 防线「git 凭据」）：
 *   - OBS_BRAIN_TOKEN 环境变量 → 运行时在 <镜像>/.git/ 下生成 askpass 辅助脚本（脚本本身无秘密，
 *     读进程环境回答 git 提问）——令牌**只进平台进程环境**，不落盘、不进远端 URL、不进 .git/config；
 *   - 未设置 OBS_BRAIN_TOKEN → 交给系统 git 凭据助手（如 Windows GCM）；
 *   - GIT_TERMINAL_PROMPT=0：任何形态下都非交互，凭据缺失立即失败而不是挂起。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---- 模块内运行状态（进程内单例；server 每次同步后经 brainStatus() 读取）----
const brainState = {
  mode: 'repo',          // repo（随仓部署，未启用镜像）| mirror
  url: '', dir: '', branch: '', head: '',
  ahead: 0, behind: 0,
  lastSyncAt: '', lastOkAt: '', lastError: '', conflict: false,
}

function git(dir, args, envExtra = {}) {
  const askpass = askpassPath(dir)
  const r = spawnSync('git', args, {
    cwd: dir || undefined,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(askpass ? { GIT_ASKPASS: askpass } : {}), ...envExtra },
  })
  if (r.status !== 0) {
    const err = new Error(`git ${args.join(' ')} 失败：${String(r.stderr || r.stdout || '').trim().slice(-400) || 'exit ' + r.status}`)
    err.git = r
    throw err
  }
  return String(r.stdout || '').trim()
}

// askpass 辅助：写在 <镜像>/.git/ 内（.git 内容 git 自身忽略，不污染工作树）。文件无秘密，令牌只从环境读。
function askpassPath(dir) {
  if (!process.env.OBS_BRAIN_TOKEN || !dir) return ''
  const gd = join(dir, '.git')
  const js = join(gd, 'brain-askpass.mjs')
  try {
    if (!existsSync(js)) {
      mkdirSync(gd, { recursive: true })
      writeFileSync(js, [
        '#!/usr/bin/env node',
        "// askpass for brain mirror — secrets live ONLY in the platform process env (OBS_BRAIN_TOKEN).",
        "const p = process.argv[2] || ''",
        "if (/user/i.test(p)) console.log(process.env.OBS_BRAIN_USERNAME || 'x-access-token')",
        "else console.log(process.env.OBS_BRAIN_TOKEN || '')",
        '',
      ].join('\n'))
      if (process.platform === 'win32') writeFileSync(join(gd, 'brain-askpass.cmd'), '@node "%~dp0brain-askpass.mjs" %*\r\n')
    }
  } catch { return '' }
  return process.platform === 'win32' ? join(gd, 'brain-askpass.cmd') : js
}

/** 确保镜像存在：缺席则 clone（remote 名固定 brain）；已存在则校验 remote 一致（不一致报错不改写）。 */
export function ensureBrainMirror({ url, dir }) {
  if (!url || !dir) throw new Error('brain 镜像需要 --brain <url|路径> 与镜像目录')
  brainState.mode = 'mirror'
  brainState.url = url
  brainState.dir = dir
  if (!existsSync(join(dir, '.git'))) {
    git(null, ['clone', '--origin', 'brain', url, dir]) // git clone 自建全部父目录
  } else {
    const actual = git(dir, ['remote', 'get-url', 'brain'])
    if (actual !== url) throw new Error(`镜像 remote 不一致：现指 ${actual}，配置为 ${url}（不改写，请主人裁决）`)
  }
  if (!brainState.branch) brainState.branch = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
  return { ok: true, dir, branch: brainState.branch }
}

/** 只读同步：fetch + ff-only 合并 + ahead/behind 记账。分叉 → conflict=true（拒后续写，呈报主人）。 */
export function syncBrainMirror({ dir } = {}) {
  dir = dir || brainState.dir
  try {
    brainState.lastSyncAt = new Date().toISOString()
    git(dir, ['fetch', '--prune', 'brain'])
    const branch = brainState.branch || git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])
    brainState.branch = branch
    const dirty = git(dir, ['status', '--porcelain'])
    if (dirty) throw new Error(`镜像工作树不干净（平台是唯一写者，出现脏文件须人工核查）：${dirty.slice(-200)}`)
    try {
      git(dir, ['merge', '--ff-only', `brain/${branch}`])
      brainState.conflict = false
      brainState.lastError = ''
    } catch (e) {
      brainState.conflict = true
      brainState.lastError = `镜像与远端分叉（ff-only 失败）：${e.message}`
    }
    const counts = git(dir, ['rev-list', '--left-right', '--count', `HEAD...brain/${branch}`]).split(/\s+/)
    brainState.ahead = Number(counts[0]) || 0
    brainState.behind = Number(counts[1]) || 0
    brainState.head = git(dir, ['rev-parse', '--short', 'HEAD'])
    if (!brainState.conflict) brainState.lastOkAt = brainState.lastSyncAt
  } catch (e) {
    brainState.lastError = e.message
    if (String(e.message).includes('分叉')) brainState.conflict = true
  }
  return brainStatus()
}

/** 知识升级写路径：先同步（要求干净工作树）→ mutate() 写入 → add 指定文件 → commit → push；
 *  任何一步失败 → reset 回到提交前基线（工作树一并还原）并拒写。 */
export function commitAndPushBrain({ dir, message, paths = [], mutate } = {}) {
  dir = dir || brainState.dir
  const before = git(dir, ['rev-parse', 'HEAD'])
  const sync = syncBrainMirror({ dir })
  if (sync.conflict || sync.lastError) return { ok: false, conflict: sync.conflict, error: sync.lastError || '镜像同步失败，拒绝在未知基线上提交' }
  if (typeof mutate === 'function') {
    try { mutate() } catch (e) {
      git(dir, ['reset', '--hard', before]) // 工作树变更前必然干净，reset 即完整还原
      return { ok: false, error: `镜像内写入失败（已还原）：${e.message}` }
    }
  }
  const rels = paths.map((p) => relative(dir, p).replace(/\\/g, '/'))
  if (rels.length) git(dir, ['add', '--', ...rels])
  const staged = git(dir, ['diff', '--cached', '--name-only'])
  if (!staged) return { ok: true, noop: true, commit: before.slice(0, 7) }
  try {
    git(dir, ['-c', 'user.name=observatory-platform', '-c', 'user.email=observatory@platform', 'commit', '-m', message])
  } catch (e) {
    git(dir, ['reset', '--hard', before])
    return { ok: false, error: `镜像提交失败（已回滚）：${e.message}` }
  }
  try {
    git(dir, ['push', 'brain', `HEAD:refs/heads/${brainState.branch}`])
  } catch (e) {
    git(dir, ['reset', '--hard', before]) // 拒写：本地提交一并回滚，镜像保持与远端一致基线
    brainState.conflict = true
    brainState.lastError = `push 被拒（已回滚本地提交，拒写）：${e.message}`
    return { ok: false, conflict: true, error: brainState.lastError }
  }
  const commit = git(dir, ['rev-parse', '--short', 'HEAD'])
  brainState.ahead = 0
  brainState.head = commit
  return { ok: true, commit, branch: brainState.branch }
}

/** 当前状态快照（健康端点与看板知识视图消费；不含任何凭据）。 */
export function brainStatus() {
  return {
    mode: brainState.mode, url: brainState.url, dir: brainState.dir, branch: brainState.branch,
    head: brainState.head, ahead: brainState.ahead, behind: brainState.behind,
    lastSyncAt: brainState.lastSyncAt, lastOkAt: brainState.lastOkAt,
    conflict: brainState.conflict, lastError: brainState.lastError,
    tokenConfigured: Boolean(process.env.OBS_BRAIN_TOKEN),
  }
}

// CLI 自检：node brain-mirror.mjs status
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(brainStatus(), null, 2))
}
