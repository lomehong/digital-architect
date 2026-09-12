#!/usr/bin/env node
/**
 * governor-e2e.mjs — Model B / C3 治理指令单（governor 远端执行面）验收回归。
 * 隔离夹具，无生产副作用；平台以受保护模式（--require-token + 管理员令牌 + yufu 桩）运行。
 *
 * 覆盖（对应 C3 验收：跨主机 confirm 端到端 + 伪造指令单被拒）：
 *   ① 未认证领单 401 / 无管理员令牌发单 401（受保护模式）
 *   ② 平台侧 action 白名单拒单（400）
 *   ③ 地址簿登记实例发单须 confirmReal（2026-09-12 同一纪律）
 *   ④ 跨宿主 confirm 端到端：发单 → governor 领单 → 本地执行 fake-ledger（--confirmed-via observatory-governor）→ 回执留痕
 *   ⑤ 跨宿主文档 status：allow-root 内 .md 前言 status 改写
 *   ⑥ 伪造指令单（签名密钥不一致的 governor）：拒绝执行 + refusal=signature + critical 留痕
 *   ⑦ governor 侧纵深：手工构造合法签名但白名单外 action → 拒单
 *   ⑧ 幂等去重：已执行单号重复领到 → 不重复执行，回执 dedupe
 *   ⑨ 平台事件过契约 v1（validate.mjs）
 *
 * governor 一律以 --once 步进运行（同 tick 代码路径，无轮询竞态）。
 * 用法：node observatory/contracts/governor-e2e.mjs   （exit 0 = 全部通过）
 */
import { spawn, execFileSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import http from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync, cpSync, appendFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OBS = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fails = []
const ok = (cond, name) => { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) fails.push(name) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ADMIN = { 'x-obs-admin': 'e2e-admin', 'Content-Type': 'application/json' }

const T = mkdtempSync(join(tmpdir(), 'obs-c3-e2e-'))
const PORT = 18792
const YUFU_PORT = 18793
const BASE = `http://127.0.0.1:${PORT}`
const dataRoot = join(T, 'obs')
const remoteHost = join(T, 'remotehost') // 模拟「另一台实例宿主」上的项目
const govState = join(T, 'gov-state')
const procs = []
// governor 以 --once 步进运行（同 tick 代码路径）；instance/sign-key 经参数与进程环境注入
async function governor(instance, key) {
  const p = spawn(process.execPath, [join(OBS, 'governor.mjs'), '--platform', BASE, '--instance', instance, '--state', govState, '--allow-root', remoteHost, '--once'], {
    env: { ...process.env, YUFU_CREDENTIAL: 'gov-token-e2e', GOV_SIGN_KEY: key },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  p.stdout.on('data', (d) => { out += d })
  p.stderr.on('data', (d) => { out += d })
  await new Promise((r) => p.on('exit', r))
  return out
}

try {
  // ---- 夹具 ----
  mkdirSync(dataRoot, { recursive: true })
  mkdirSync(join(dataRoot, 'config'), { recursive: true })
  writeFileSync(join(dataRoot, 'config', 'data-roots.yml'), 'roots:\n  - instanceId: omp-e2e-01\n    taskRoot: X\n    label: e2e 登记实例\n')
  cpSync(join(OBS, 'test-fixtures', 'fake-ledger'), join(remoteHost, 'fixture'), { recursive: true })
  mkdirSync(join(remoteHost, 'docs'), { recursive: true })
  writeFileSync(join(remoteHost, 'docs', 'note.md'), '---\ntitle: e2e 夹具文档\nstatus: 草案\n---\n\n仅存在于 e2e 临时目录。\n')

  // yufu 桩：仅认 gov-token-e2e
  const yufu = http.createServer((req, res) => {
    let b = ''
    req.on('data', (c) => { b += c })
    req.on('end', () => {
      const token = String(b.match(/"token"\s*:\s*"([^"]*)"/)?.[1] || '')
      const h = { 'Content-Type': 'application/json' }
      res.writeHead(200, h)
      res.end(JSON.stringify(token === 'gov-token-e2e' ? { valid: true, agent_id: 'gov-e2e-agent' } : { valid: false }))
    })
  })
  await new Promise((r) => yufu.listen(YUFU_PORT, '127.0.0.1', r))
  procs.push(yufu)

  // 平台：受保护模式 + 指令单签名密钥
  procs.push(spawn(process.execPath, [join(OBS, 'server.mjs'), '--data', dataRoot, '--port', String(PORT), '--require-token', '--yufu-url', `http://127.0.0.1:${YUFU_PORT}`, '--admin-token', 'e2e-admin'], { env: { ...process.env, GOV_SIGN_KEY: 'e2e-sign-key' }, stdio: 'ignore' }))
  for (let i = 0; i < 40; i++) { await sleep(500); try { if ((await (await fetch(`${BASE}/api/health`)).json()).ok) break } catch { /* 未就绪 */ } }

  const post = (path, body, headers = ADMIN) => fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const snapshot = async () => (await fetch(`${BASE}/api/snapshot`, { headers: { 'x-obs-admin': 'e2e-admin' } })).json()
  const readOrder = (id) => JSON.parse(readFileSync(join(dataRoot, 'govern-orders', 'done', `${id}.json`), 'utf8'))

  // ---- ① 未认证 ----
  ok((await fetch(`${BASE}/api/govern/orders?instanceId=omp-e2e-01`)).status === 401, '未认证领单被拒（401）')
  ok((await post('/api/govern/dispatch', { instanceId: 'omp-e2e-01', action: 'task-ledger', sub: 'confirm', taskId: 'T', root: remoteHost, by: 'x' }, { 'Content-Type': 'application/json' })).status === 401, '无管理员令牌发单被拒（401）')

  // ---- ② 平台白名单 ----
  ok(!(await post('/api/govern/dispatch', { instanceId: 'omp-e2e-01', action: 'shell', args: { cmd: 'x' }, by: 'e2e' })).ok === true, '平台侧 action 白名单外拒单（400）')

  // ---- ③ confirmReal 纪律 ----
  const r3 = await (await post('/api/govern/dispatch', { instanceId: 'omp-e2e-01', action: 'task-ledger', sub: 'confirm', taskId: 'FIXTURE-T1', root: join(remoteHost, 'fixture'), by: 'C3端到端验证' })).json()
  ok(String(r3.error || '').includes('confirmReal'), '地址簿登记实例发单须显式 confirmReal（2026-09-12 防线沿用）')

  // ---- ④ 跨宿主 confirm 端到端 ----
  const r4 = await (await post('/api/govern/dispatch', { instanceId: 'omp-e2e-01', action: 'task-ledger', sub: 'confirm', taskId: 'FIXTURE-T1', root: join(remoteHost, 'fixture'), by: 'C3端到端验证', confirmReal: true })).json()
  ok(r4.ok === true && /^GOV-/.test(r4.id || ''), `发单成功（${r4.id}）`)
  await governor('omp-e2e-01', 'e2e-sign-key')
  const box4 = readOrder(r4.id)
  ok(box4.receipt?.ok === true && box4.receipt.out.includes('fake-ledger') && box4.receipt.out.includes('--confirmed-via observatory-governor'), 'governor 领单本地执行（回执含 fake-ledger 执行形状）')
  ok((await snapshot()).governorOrders.done.some((o) => o.id === r4.id && o.state === '已完成'), '指令单状态=已完成（快照可见）')

  // ---- ⑤ 文档 status ----
  const r5 = await (await post('/api/govern/dispatch', { instanceId: 'omp-e2e-01', action: 'doc-status', file: join(remoteHost, 'docs', 'note.md'), from: '草案', to: '已落定', by: 'C3端到端验证' })).json()
  ok(r5.ok === true, '文档 status 发单成功')
  await governor('omp-e2e-01', 'e2e-sign-key')
  ok(readFileSync(join(remoteHost, 'docs', 'note.md'), 'utf8').includes('status: 已落定'), '文档 status 经 governor 本地改写（allow-root 内）')

  // ---- ⑥ 伪造指令单 ----
  const r6 = await (await post('/api/govern/dispatch', { instanceId: 'omp-e2e-bad', action: 'task-ledger', sub: 'confirm', taskId: 'FIXTURE-T1', root: join(remoteHost, 'fixture'), by: 'C3端到端验证', confirmReal: true })).json()
  const badOut = await governor('omp-e2e-bad', 'wrong-key')
  const box6 = readOrder(r6.id)
  ok(box6.receipt?.ok === false && box6.receipt.refusal === 'signature', '伪造指令单被拒执行（refusal=signature）')
  ok(badOut.includes('伪造') || badOut.includes('验签失败'), 'governor 留伪造拒绝日志')
  const evTxt = readFileSync(join(dataRoot, 'events', 'observatory-platform', new Date().toISOString().slice(0, 10) + '.ndjson'), 'utf8')
  ok(evTxt.includes('"refusal":"signature"') && evTxt.includes('"severity":"critical"'), '伪造拒绝留 critical 呈报事件')

  // ---- ⑦ governor 侧纵深：合法签名但白名单外 ----
  const craftOrder = { id: 'GOV-e2e-craft', instanceId: 'omp-e2e-01', action: 'shell', args: { by: 'e2e', cmd: 'echo pwned' }, createdAt: new Date().toISOString() }
  const canon = [craftOrder.id, craftOrder.instanceId, craftOrder.action, JSON.stringify(craftOrder.args), craftOrder.createdAt].join('|')
  mkdirSync(join(dataRoot, 'govern-orders', 'pending'), { recursive: true })
  writeFileSync(join(dataRoot, 'govern-orders', 'pending', `${craftOrder.id}.json`), JSON.stringify({ order: craftOrder, sig: createHmac('sha256', 'e2e-sign-key').update(canon).digest('hex') }))
  await governor('omp-e2e-01', 'e2e-sign-key')
  const box7 = JSON.parse(readFileSync(join(dataRoot, 'govern-orders', 'done', `${craftOrder.id}.json`), 'utf8'))
  ok(box7.receipt.ok === false && box7.receipt.refusal === 'whitelist' && !box7.receipt.out?.includes('pwned'), '白名单外 action 被纵深拒单（签名合法也不执行）')

  // ---- ⑧ 幂等去重 ----
  const r8 = await (await post('/api/govern/dispatch', { instanceId: 'omp-e2e-01', action: 'task-ledger', sub: 'confirm', taskId: 'FIXTURE-T1', root: join(remoteHost, 'fixture'), by: 'C3端到端验证', confirmReal: true })).json()
  mkdirSync(govState, { recursive: true })
  appendFileSync(join(govState, 'executed.ndjson'), JSON.stringify({ id: r8.id, ok: true, note: 'e2e 预置', at: new Date().toISOString() }) + '\n')
  await governor('omp-e2e-01', 'e2e-sign-key')
  const box8 = readOrder(r8.id)
  ok(box8.receipt.ok === false && box8.receipt.refusal === 'dedupe', '已执行单号重复领到 → 不重复执行（dedupe 回执）')

  // ---- ⑨ 契约校验 ----
  let vOk = false
  try { execFileSync(process.execPath, [join(OBS, 'contracts', 'validate.mjs'), join(dataRoot, 'events', 'observatory-platform', new Date().toISOString().slice(0, 10) + '.ndjson')], { stdio: 'pipe' }); vOk = true } catch { /* 校验失败 */ }
  ok(vOk, '指令单全量事件过契约 v1 校验（validate.mjs PASS）')
} finally {
  for (const p of procs) { try { p.close ? p.close() : p.kill() } catch { /* 已退出 */ } }
  await sleep(600)
  try { rmSync(T, { recursive: true, force: true }) } catch { /* Windows 句柄延迟：留给系统清理 */ }
  if (fails.length) { console.error(`\n[governor-e2e] FAIL：${fails.length} 项未过`); process.exit(1) }
  console.log('\n[governor-e2e] PASS：C3 验收全过（夹具隔离，无生产副作用）')
}
