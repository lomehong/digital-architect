#!/usr/bin/env node
/**
 * Gate Guard：门禁资产变更防护（红线提案落地，需求包 2026-09-15）。
 *
 * 红线（主人确认，principle/self-evolving-systems-design-lessons.md）：
 * 被检对象（agent）不得改动考卷——检查器/门禁/基线的变更必须携带主人批准标记。
 *
 * 用法：node scripts/gate-guard.mjs [base] [head]
 *   base 默认取 GATE_BASE（CI 注入 github.event.before），缺省回退 HEAD~1（仅覆盖最后提交，附告警）；
 *   head 默认取 GATE_HEAD（CI 注入 github.sha），缺省 HEAD。
 *
 * 逻辑：diff --name-only base..head 命中保护清单 → 区间内**触碰保护路径的每个提交**
 * 的提交信息都须含标记 `Gate-Approved`；任一缺失 → FAIL（列出提交）。
 * 退出码：0=pass；1=fail（error 阻断）；2=内部错误（fail-closed）。
 *
 * 自指保护：本脚本在保护清单内——改本脚本同样需要标记。
 *
 * @module scripts/gate-guard
 */
import { execSync } from 'node:child_process'

const MARKER = 'Gate-Approved'

const PROTECTED = [
  '.github/workflows/**',
  'packages/architect-core/src/**',
  'dsh-architect/scripts/**',
  'docs/metrics/**',
  'scripts/gate-guard.mjs',
]

function git(args) {
  return execSync(`git ${args}`, { encoding: 'utf8' })
}

function normPath(p) {
  return p.replace(/\\/g, '/').trim()
}

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  return new RegExp('^' + escaped.replace(/\*\*/g, '::').replace(/\*/g, '[^/]*').replace(/::/g, '.*') + '$')
}

function hitsProtected(file) {
  return PROTECTED.some(p => globToRegex(p).test(normPath(file)))
}

function isAllZero(sha) {
  return /^0+$/.test(sha ?? '')
}

/** 区间内提交清单（base..head）；base 不可解析时返回 null。 */
function listCommits(base, head) {
  try {
    return git(`rev-list ${base}..${head}`).split('\n').map(s => s.trim()).filter(Boolean)
  } catch {
    return null
  }
}

function main() {
  let base = process.argv[2] ?? process.env.GATE_BASE ?? ''
  const head = process.argv[3] ?? process.env.GATE_HEAD ?? 'HEAD'
  try {
    git('rev-parse --verify HEAD')
  } catch {
    console.error('⛔ 不在 git 仓库或无 HEAD（fail-closed）')
    process.exit(2)
  }
  if (base === '' || isAllZero(base)) {
    base = 'HEAD~1'
    console.log('⚠️ base 缺省/全零，回退 HEAD~1..HEAD（仅覆盖最后一个提交；CI 请注入 github.event.before）')
  }
  let changed
  try {
    changed = git(`diff --name-only ${base} ${head}`).split('\n').map(normPath).filter(Boolean)
  } catch {
    console.error(`⛔ diff 失败（base=${base} 不可解析？）——fail-closed`)
    process.exit(2)
  }
  const hits = changed.filter(f => hitsProtected(f))
  if (hits.length === 0) {
    console.log(`✅ Gate Guard PASS：${changed.length} 个变更文件未触碰门禁资产`)
    process.exit(0)
  }
  const commits = listCommits(base, head)
  if (commits === null || commits.length === 0) {
    console.error('⛔ 保护路径有变更但无法定位区间内提交——fail-closed')
    for (const f of hits) console.error(`  ⛔ ${f}`)
    process.exit(1)
  }
  // 逐提交校验：只要求「触碰了保护路径」的提交带标记
  const offenders = []
  for (const sha of commits) {
    let files = []
    let message = ''
    try {
      files = git(`diff-tree --no-commit-id --name-only -r ${sha}`).split('\n').map(normPath).filter(Boolean)
      message = git(`log -1 --format=%B ${sha}`)
    } catch {
      console.error(`⛔ 无法读取提交 ${sha}——fail-closed`)
      process.exit(2)
    }
    if (!files.some(f => hitsProtected(f))) continue
    if (!message.includes(MARKER)) offenders.push(sha)
  }
  if (offenders.length > 0) {
    console.error(`⛔ Gate Guard FAIL：以下触碰门禁资产的提交缺少标记「${MARKER}」（主人批准后由执行会话写入）：`)
    for (const sha of offenders) console.error(`  ⛔ ${sha}`)
    for (const f of hits) console.error(`  ⛔ 保护路径变更：${f}`)
    process.exit(1)
  }
  console.log(`✅ Gate Guard PASS：保护路径变更 ${hits.length} 个，标记齐备`)
  process.exit(0)
}

main()
