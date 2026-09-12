#!/usr/bin/env node
/**
 * brain-mirror-e2e.mjs — Model B / C2 大脑仓 git 镜像验收回归（零依赖，隔离夹具，无生产副作用）。
 *
 * 流程（对应技术方案 C2 验收：镜像机上看板全量条目；知识升级经 commit+push 落到远端）：
 *   1. 临时 bare 远端（种子自大脑仓真身，只读）+ 合成「待审核」条目（practice×2 + meta×1）；
 *   2. 独立启动平台（--brain 指向夹具远端，无仓目录语义：--data 指临时数据根）；
 *   3. 断言：镜像模式启用、启动同步成功、知识视图全量条目上屏；
 *   4. 知识升级 → 镜像 commit+push 落夹具远端；第二副本（全新克隆）拉取同见——多副本经 git 同步；
 *   5. meta 类条目按 basename 升级（五类解析修复回归）；
 *   6. 负测：远端改写历史致分叉 → 升级被拒（HTTP 400 + 拒写）+ 镜像条目未被改动 + critical 留痕事件；
 *   7. 随仓回归：无 --brain 启动 → brain.mode=repo、health sources.brain=disabled、知识照常上屏；
 *   8. 收尾：按 pid 杀子进程、删临时目录（不触碰任何生产数据）。
 *
 * 用法：node observatory/contracts/brain-mirror-e2e.mjs   （exit 0 = 全部通过）
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OBS = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = resolve(OBS, '..')
const g = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' })
const fails = []
const ok = (cond, name) => { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) fails.push(name) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const T = mkdtempSync(join(tmpdir(), 'obs-c2-e2e-'))
const procs = []
try {
  // ---- 1) 夹具远端 ----
  const bare = join(T, 'brain-fixture.git')
  g(['clone', '--bare', REPO, bare])
  const seed = join(T, 'seed-work')
  g(['clone', bare, seed])
  const fm = (t) => `---\ntitle: ${t}（C2 e2e 夹具）\nstatus: 待审核\ndomain: dsh-ecosystem\n---\n\n# ${t}\n\n仅存在于 e2e 夹具远端，不进入大脑仓真身。\n`
  mkdirSync(join(seed, 'architect-knowledge', 'practice'), { recursive: true })
  mkdirSync(join(seed, 'architect-knowledge', 'meta'), { recursive: true })
  writeFileSync(join(seed, 'architect-knowledge', 'practice', 'c2-fixture-promote.md'), fm('C2 升级验证'))
  writeFileSync(join(seed, 'architect-knowledge', 'practice', 'c2-fixture-conflict.md'), fm('C2 冲突负测'))
  writeFileSync(join(seed, 'architect-knowledge', 'meta', 'c2-fixture-meta.md'), fm('C2 五类解析'))
  const branch = g(['rev-parse', '--abbrev-ref', 'HEAD'], seed).trim()
  g(['add', '--', '.'], seed)
  g(['-c', 'user.name=e2e', '-c', 'user.email=e2e@fixture', 'commit', '-m', 'C2 夹具：合成待审核条目×3'], seed)
  g(['push', 'origin', 'HEAD'], seed)

  // ---- 2) 独立平台（镜像模式）----
  const obsRoot = join(T, 'obs')
  const PORT = 18790
  procs.push(spawn(process.execPath, [join(OBS, 'server.mjs'), '--data', obsRoot, '--port', String(PORT), '--brain', bare, '--brain-sync-sec', '3600'], { stdio: 'ignore' }))
  const base = `http://127.0.0.1:${PORT}`
  let s = null
  for (let i = 0; i < 80; i++) {
    await sleep(500)
    try { s = await (await fetch(`${base}/api/snapshot`)).json(); if (s.brain?.lastOkAt) break } catch { /* 未就绪 */ }
  }
  ok(s?.brain?.mode === 'mirror', '镜像模式启用（brain.mode=mirror）')
  ok(Boolean(s?.brain?.lastOkAt) && !s?.brain?.conflict, `启动同步成功（head=${s?.brain?.head}）`)
  ok((s?.knowledgeBase?.total ?? 0) >= 30, `镜像机看板全量条目（total=${s?.knowledgeBase?.total ?? 0} ≥30）`)
  ok((s?.knowledgeBase?.entries ?? []).some((e) => e.file === 'practice/c2-fixture-promote.md'), '合成条目经镜像上屏')
  ok(Object.keys(s?.knowledgeBase?.byCategory ?? {}).length === 5, '五类分布齐全')

  // ---- 3) 知识升级 → 镜像 commit+push 落远端 ----
  const post = (body) => fetch(`${base}/api/govern/knowledge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const r1 = await (await post({ entry: 'c2-fixture-promote', to: '已确认', by: 'C2端到端验证' })).json()
  ok(r1.ok === true && r1.plane === 'brain-mirror' && Boolean(r1.commit), `升级经镜像 commit+push（commit=${r1.commit}）`)
  ok(g(['-C', bare, 'log', '-1', '--format=%s']).includes('知识治理'), '夹具远端收到治理提交')

  // ---- 4) 第二副本经 git 同步同见 ----
  const replica = join(T, 'replica')
  g(['clone', bare, replica])
  ok(readFileSync(join(replica, 'architect-knowledge', 'practice', 'c2-fixture-promote.md'), 'utf8').includes('status: 已确认'), '第二副本克隆拉取同见（多副本经 git 同步）')

  // ---- 5) 五类解析：meta 条目按 basename 升级 ----
  const r2 = await (await post({ entry: 'c2-fixture-meta', to: '已确认', by: 'C2端到端验证' })).json()
  ok(r2.ok === true, 'meta 类条目按 basename 解析并升级成功')

  // ---- 6) 冲突负测：远端改写历史 → 分叉 → 升级拒写 ----
  const diverge = join(T, 'diverge')
  g(['clone', bare, diverge])
  const lastMsg = g(['log', '-1', '--format=%s'], diverge)
  g(['-c', 'user.name=e2e', '-c', 'user.email=e2e@fixture', 'commit', '--amend', '-m', `${lastMsg}（远端改写）`], diverge)
  g(['push', '--force', 'origin', 'HEAD'], diverge)
  const mirrorEntry = join(obsRoot, 'brain-mirror', 'architect-knowledge', 'practice', 'c2-fixture-conflict.md')
  const before = readFileSync(mirrorEntry, 'utf8')
  const res3 = await post({ entry: 'c2-fixture-conflict', to: '已确认', by: 'C2端到端验证' })
  const r3 = await res3.json()
  ok(res3.status === 400 && String(r3.error || '').includes('拒写'), `分叉时升级被拒（HTTP ${res3.status}：${String(r3.error || '').slice(0, 40)}…）`)
  ok(readFileSync(mirrorEntry, 'utf8') === before, '拒写：镜像条目未被改动')
  const evFile = join(obsRoot, 'events', 'observatory-platform', new Date().toISOString().slice(0, 10) + '.ndjson')
  const evTxt = (() => { try { return readFileSync(evFile, 'utf8') } catch { return '' } })()
  ok(evTxt.includes('"type":"platform.brain.sync"') && evTxt.includes('knowledge-promote-rejected'), '拒写已留 critical 呈报事件')
  let vOk = false
  try { execFileSync(process.execPath, [join(OBS, 'contracts', 'validate.mjs'), evFile], { stdio: 'pipe' }); vOk = true } catch { /* 校验失败 */ }
  ok(vOk, '本夹具产生的平台事件过契约 v1 校验（validate.mjs PASS）')

  // ---- 7) 随仓回归（无 --brain）----
  const obsRoot2 = join(T, 'obs-repo-mode')
  procs.push(spawn(process.execPath, [join(OBS, 'server.mjs'), '--data', obsRoot2, '--port', '18791'], { stdio: 'ignore' }))
  let s2 = null
  for (let i = 0; i < 40; i++) {
    await sleep(500)
    try { s2 = await (await fetch('http://127.0.0.1:18791/api/snapshot')).json(); if (s2?.instances?.length) break } catch { /* 未就绪 */ }
  }
  const h2 = await (await fetch('http://127.0.0.1:18791/api/health')).json()
  ok(s2?.brain?.mode === 'repo', '随仓回归：无 --brain 即现状行为（brain.mode=repo）')
  ok(h2?.sources?.brain === 'disabled', '随仓回归：health sources.brain=disabled')
  ok((s2?.knowledgeBase?.total ?? 0) >= 30, `随仓回归：知识照常上屏（total=${s2?.knowledgeBase?.total ?? 0}）`)
} finally {
  for (const p of procs) { try { p.kill() } catch { /* 已退出 */ } }
  await sleep(800)
  try { rmSync(T, { recursive: true, force: true }) } catch { /* Windows 句柄延迟：留下由系统清理 */ }
  if (fails.length) { console.error(`\n[brain-mirror-e2e] FAIL：${fails.length} 项未过`); process.exit(1) }
  console.log('\n[brain-mirror-e2e] PASS：C2 验收全过（夹具隔离，无生产副作用）')
}
