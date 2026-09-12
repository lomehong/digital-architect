#!/usr/bin/env node
/**
 * governor.mjs — Model B / C3 实例宿主治理 agent（零 npm 依赖）。
 *
 * 角色与边界（docs/designs/2026-09-12-平台独立部署演进-技术方案.md §2 治理面 / §4 防线）：
 *   平台发「治理指令单」（管理员令牌门 + 单号幂等 + HMAC 签名）→ 本 agent 向平台**领单**
 *   → 验签 + 白名单校验 → **本地执行**（task-ledger CLI / 文档 status）→ 回执上报，全程留痕。
 *   不开监听端口（pull 模型）；不用计划任务/隐藏窗口（杀软教训）——在可见终端手动启动。
 *
 * 认证与签名：
 *   - YUFU_CREDENTIAL（环境变量）：御符 token，领单/回执时平台经 yufu_verify 验「谁在领单」；
 *   - GOV_SIGN_KEY（环境变量）：与平台共享的指令单签名密钥（HMAC-SHA256），**只进进程环境**；
 *     验签不过 = 伪造指令单，拒绝执行并回执 critical 证据，绝不落任何写操作。
 *
 * 幂等：state/executed.ndjson 记录已执行单号；同一单重复领到不重复执行（回执 dedupe）。
 *
 * 用法：
 *   node governor.mjs --platform <平台url> --instance <实例id> [--state <目录>] [--interval-sec 15] [--allow-root <dir>]... [--once]
 * 白名单（除此之外一律拒单）：
 *   - task-ledger：args.sub ∈ {confirm, reject}，执行 <root>/scripts/task-ledger.mjs（四不变量由 ledger 强制）
 *   - doc-status ：改 <allow-root> 下 .md 的 frontmatter status 行（路径越界 = 拒单）
 */
import { execFileSync } from 'node:child_process'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { join, resolve, sep, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ARGV = process.argv
const argOf = (name, def = '') => { const i = ARGV.indexOf(name); return i > 0 ? ARGV[i + 1] : def }
const PLATFORM = (argOf('--platform') || '').replace(/\/$/, '')
const INSTANCE = argOf('--instance')
const STATE_DIR = resolve(argOf('--state', join(dirname(fileURLToPath(import.meta.url)), 'governor-state')))
const INTERVAL_SEC = Number(argOf('--interval-sec', '15'))
const ALLOW_ROOTS = ARGV.flatMap((a, i) => (a === '--allow-root' ? [resolve(ARGV[i + 1])] : []))
const ONCE = ARGV.includes('--once')
const TOKEN = process.env.YUFU_CREDENTIAL || ''
const SIGN_KEY = process.env.GOV_SIGN_KEY || ''

const EXECUTED_FILE = join(STATE_DIR, 'executed.ndjson')
const log = (s) => console.log(`[governor ${INSTANCE || '?'}] ${new Date().toISOString()} ${s}`)

// ---- 幂等去重（本地已执行单号，只增不改）----
function executedMap() {
  const m = new Map()
  try {
    for (const l of readFileSync(EXECUTED_FILE, 'utf8').split(/\r?\n/)) {
      if (!l.trim()) continue
      try { const j = JSON.parse(l); m.set(j.id, j) } catch { /* 残行容忍 */ }
    }
  } catch { /* 首次无文件 */ }
  return m
}
function recordExecuted(id, ok, note) {
  mkdirSync(STATE_DIR, { recursive: true })
  appendFileSync(EXECUTED_FILE, JSON.stringify({ id, ok, note, at: new Date().toISOString() }) + '\n')
}

// ---- 签名验证（验签不过 = 伪造指令单）----
const canonical = (o) => [o.id, o.instanceId, o.action, JSON.stringify(o.args), o.createdAt].join('|')
function sigOk(order, sig) {
  if (!SIGN_KEY) return false
  const expect = Buffer.from(createHmac('sha256', SIGN_KEY).update(canonical(order)).digest('hex'))
  const got = Buffer.from(String(sig || ''))
  return expect.length === got.length && timingSafeEqual(expect, got)
}

// ---- 白名单校验（平台验证之外的第二道防线；纵深独立成立）----
function whitelist(o) {
  const a = o.args || {}
  if (o.action === 'task-ledger') {
    if (!['confirm', 'reject'].includes(a.sub)) return { ok: false, why: `task-ledger.sub 白名单外：${a.sub}` }
    if (!a.taskId || !a.root || !a.by) return { ok: false, why: 'task-ledger 需 taskId/root/by' }
    const script = join(resolve(a.root), 'scripts', 'task-ledger.mjs')
    if (!existsSync(script)) return { ok: false, why: `台账脚本不存在：${script}` }
    return { ok: true, script }
  }
  if (o.action === 'doc-status') {
    if (!a.file || !String(a.file).endsWith('.md') || !a.to) return { ok: false, why: 'doc-status 需 .md 文件与目标 status' }
    const f = resolve(a.file)
    const inside = ALLOW_ROOTS.some((r) => (f === r || f.startsWith(r + sep)))
    if (!inside) return { ok: false, why: `路径越界（不在 --allow-root 内）：${f}` }
    return { ok: true, file: f }
  }
  return { ok: false, why: `action 白名单外：${o.action}` }
}

// ---- 执行（固定形状参数，不拼 shell；白名单外永不抵达这里）----
function execute(o, w) {
  const a = o.args
  if (o.action === 'task-ledger') {
    return execFileSync('node', [w.script, a.sub, '--id', a.taskId, '--by', a.by, '--confirmed-by', a.by, '--confirmed-via', 'observatory-governor', '--root', resolve(a.root)], { encoding: 'utf8', timeout: 120_000 })
  }
  // doc-status：仅改 frontmatter 首个 status 行
  const raw = readFileSync(w.file, 'utf8')
  if (a.from && !new RegExp(`^status:\\s*${a.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(raw)) {
    throw new Error(`status 与期望来源不符（期望 ${a.from}），拒绝盲改`)
  }
  if (!/^status:\s*\S+\s*$/m.test(raw)) throw new Error('未找到 status 行，拒绝盲改')
  writeFileSync(w.file, raw.replace(/^status:\s*\S+\s*$/m, `status: ${a.to}`))
  return `doc-status 已改：${w.file} → ${a.to}（by ${a.by}）`
}

// ---- 回执 ----
async function post(path, body) {
  const res = await fetch(`${PLATFORM}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
async function receipt(orderId, payload) {
  const r = await post('/api/govern/receipt', { orderId, instanceId: INSTANCE, at: new Date().toISOString(), ...payload })
  log(`回执 ${orderId}: HTTP ${r.status}（ok=${payload.ok}${payload.refusal ? '，refusal=' + payload.refusal : ''}）`)
}

async function tick() {
  if (!PLATFORM || !INSTANCE) { log('缺 --platform / --instance，退出'); process.exit(2) }
  if (!TOKEN) log('警告：未设 YUFU_CREDENTIAL——受保护模式下领单会被 401 拒绝')
  if (!SIGN_KEY) log('警告：未设 GOV_SIGN_KEY——所有指令单都将因验签不过被拒（伪造防线默认收紧）')
  const res = await fetch(`${PLATFORM}/api/govern/orders?instanceId=${encodeURIComponent(INSTANCE)}`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(15_000) })
  if (res.status === 401) { log(`领单被拒（HTTP 401）：${(await res.json().catch(() => ({}))).error || ''}`); return }
  const { orders } = await res.json()
  if (!orders?.length) { log('无待执行指令单'); return }
  const done = executedMap()
  for (const box of orders) {
    const o = box.order
    if (done.has(o.id)) {
      await receipt(o.id, { ok: false, refusal: 'dedupe', error: '该单号已执行过（幂等去重），不重复执行；如需重发请新发单' })
      continue
    }
    if (!sigOk(o, box.sig)) {
      log(`⛔ 伪造/验签失败：${o.id}——拒绝执行，回执留证`)
      await receipt(o.id, { ok: false, refusal: 'signature', error: '指令单签名验证失败（伪造或密钥不一致），未执行任何操作' })
      continue
    }
    const w = whitelist(o)
    if (!w.ok) {
      log(`⛔ 白名单拒单：${o.id}（${w.why}）`)
      recordExecuted(o.id, false, w.why)
      await receipt(o.id, { ok: false, refusal: o.action === 'doc-status' && w.why.includes('越界') ? 'scope' : 'whitelist', error: w.why })
      continue
    }
    try {
      const out = execute(o, w)
      recordExecuted(o.id, true, 'ok')
      log(`✅ 已执行 ${o.id}（${o.action}）`)
      await receipt(o.id, { ok: true, out: String(out).slice(-800) })
    } catch (e) {
      recordExecuted(o.id, false, 'exec-failed')
      log(`❌ 执行失败 ${o.id}：${e.message}`)
      await receipt(o.id, { ok: false, refusal: 'exec', error: String(e.message).slice(-300) })
    }
  }
}

if (ONCE) {
  tick().then(() => process.exit(0)).catch((e) => { log(`tick 失败：${e.message}`); process.exit(1) })
} else {
  log(`启动：平台 ${PLATFORM}，状态目录 ${STATE_DIR}，白名单根 [${ALLOW_ROOTS.join('，') || '（无——doc-status 将全部越界拒单）'}]`)
  const loop = () => tick().catch((e) => log(`tick 失败：${e.message}`))
  loop()
  setInterval(loop, Math.max(3, INTERVAL_SEC) * 1000)
}
