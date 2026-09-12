#!/usr/bin/env node
/**
 * server.mjs — Architect Observatory 平台服务（零 npm 依赖）。
 *
 * 数据面：watch obs/（实例注册+事件流）+ docs/tasks（台账）+ review-queue → 内存聚合。
 * 治理面：POST /api/govern/* → 调 task-ledger.mjs CLI（不旁路四不变量）+ 发 governance.* 审计事件。
 * 看板：public/index.html（GET /），绑定 127.0.0.1:8787。
 *
 * 用法：node server.mjs [--root <总仓根>] [--port 8787]   # 缺省 root = 脚本上级目录
 */
import http from 'node:http'
import { watch, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 8787)
const OBS = join(ROOT, 'obs')
const INSTANCES_DIR = join(OBS, 'instances')
const EVENTS_DIR = join(OBS, 'events')
const HEARTBEAT_FACTOR = 3

// 台账目录（可重复 --tasks <dir>）：yaml 现值为权威状态源，事件流提供历史轨迹
const TASK_DIRS = []
{
  const argv = process.argv
  for (let i = 2; i < argv.length; i++) if (argv[i] === '--tasks') TASK_DIRS.push(argv[++i])
}

// ---- 内存聚合模型 ----
const state = { instances: {}, events: [], alerts: [], lastError: null }

function listNdjson(dir) {
  try { return readdirSync(dir).filter((f) => f.endsWith('.ndjson')).sort() } catch { return [] }
}
function loadInstances() {
  const out = {}
  try {
    for (const f of readdirSync(INSTANCES_DIR).filter((f) => f.endsWith('.yaml'))) {
      const raw = readFileSync(join(INSTANCES_DIR, f), 'utf8')
      const id = (raw.match(/instanceId:\s*(\S+)/) || [])[1] ?? f.replace('.yaml', '')
      const pick = (k) => (raw.match(new RegExp(`${k}:\\s*(.+)`)) || [])[1]?.trim() ?? ''
      const lastSeenAt = pick('lastSeenAt')
      const hb = Number((raw.match(/heartbeatIntervalSec:\s*(\d+)/) || [])[1] ?? 60)
      const staleMs = Date.now() - (Date.parse(lastSeenAt) || 0)
      const status = staleMs > hb * 1000 * HEARTBEAT_FACTOR ? 'offline' : 'online'
      const systems = (raw.match(/systems:\s*\[([^\]]*)\]/) || [])[1]?.split(',').map((s) => s.trim()).filter(Boolean) ?? []
      out[id] = { instanceId: id, hostType: pick('hostType'), systems, status, lastSeenAt, heartbeatIntervalSec: hb }
    }
  } catch (e) { state.lastError = `instances: ${e.message}` }
  return out
}
function loadEvents() {
  const out = []
  try {
    for (const inst of readdirSync(EVENTS_DIR)) {
      for (const f of listNdjson(join(EVENTS_DIR, inst))) {
        const lines = readFileSync(join(EVENTS_DIR, inst, f), 'utf8').split(/\r?\n/).filter((l) => l.trim())
        for (const l of lines) { try { out.push(JSON.parse(l)) } catch { /* 残行容忍 */ } }
      }
    }
  } catch (e) { state.lastError = `events: ${e.message}` }
  return out.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
}
function loadReviewQueue() {
  try {
    const raw = readFileSync(join(ROOT, 'architect-knowledge', 'review-queue.yaml'), 'utf8')
    return { raw, entries: (raw.match(/- /g) ?? []).length }
  } catch { return { raw: '', entries: 0 } }
}
function loadLedgerTasks() {
  const out = {}
  for (const dir of TASK_DIRS) {
    try {
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
        const raw = readFileSync(join(dir, f), 'utf8')
        const id = (raw.match(/id:\s*'([^']+)'/) || [])[1]
        if (!id) continue
        const state = (raw.match(/state:\s*'([^']+)'/) || [])[1] ?? '未知'
        const title = (raw.match(/title:\s*'([^']*)'/) || [])[1] ?? ''
        const level = (raw.match(/level:\s*'([^']*)'/) || [])[1] ?? ''
        out[id] = { taskId: id, state, title, level, source: 'ledger' }
      }
    } catch { /* 目录不可达：跳过该源 */ }
  }
  return out
}

function snapshot() {
  const instances = loadInstances()
  const events = loadEvents()
  const rq = loadReviewQueue()
  const critical = events.filter((e) => e.severity === 'critical')
  const governance = events.filter((e) => String(e.type).startsWith('governance.'))
  const tasks = {}
  for (const e of events) {
    if (e.domain === 'task' && e.payload?.taskId) {
      tasks[e.payload.taskId] = { system: e.system, state: e.payload.to ?? e.type, by: e.payload.by ?? '', ts: e.ts }
    }
  }
  // 台账 yaml 现值为权威（覆盖事件流推导的历史状态）
  for (const dir of TASK_DIRS) {
    try {
      for (const f of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
        const raw = readFileSync(join(dir, f), 'utf8')
        const id = (raw.match(/id:\s*'([^']+)'/) || [])[1]
        const state = (raw.match(/state:\s*'([^']+)'/) || [])[1] ?? ''
        if (id) tasks[id] = { ...(tasks[id] ?? {}), taskId: id, state, source: 'ledger' }
      }
    } catch { /* 目录不可达 */ }
  }
  return { generatedAt: new Date().toISOString(), instances: Object.values(instances), events: events.slice(-500), tasks, reviewQueue: rq, alerts: critical.slice(-50), governance: governance.slice(-50), lastError: state.lastError }
}

// ---- 治理操作（经 task-ledger CLI，不旁路四不变量）----
function governTask(taskId, root, action, by) {
  const sub = action === 'confirm' ? 'confirm' : action === 'reject' ? 'reject' : null
  if (!sub) throw new Error(`未知治理动作：${action}`)
  // 台账脚本随目标项目走：<root>/scripts/task-ledger.mjs；confirm 须带来源（--confirmed-by/--confirmed-via）
  const args = [join(root, 'scripts', 'task-ledger.mjs'), sub, '--id', taskId, '--by', by, '--confirmed-by', by, '--confirmed-via', 'observatory', '--root', root]
  const out = execFileSync('node', args, { encoding: 'utf8' })
  appendEvent({ domain: 'governance', type: `governance.${action}`, severity: 'info', subject: taskId, payload: { by, via: 'observatory', out: out.slice(-200) } })
  return { ok: true, out: out.slice(-500) }
}
function promoteKnowledge(entry, to) {
  const file = join(ROOT, 'architect-knowledge', 'practice', `${entry}.md`)
  let c = readFileSync(file, 'utf8')
  c = c.replace(/status:\s*(待审核|已确认)/, `status: ${to}`)
  writeFileSync(file, c)
  appendEvent({ domain: 'governance', type: 'governance.knowledge-promote', severity: 'info', subject: entry, payload: { to, via: 'observatory' } })
  return { ok: true }
}
function appendEvent(ev) {
  ev.ts = new Date().toISOString()
  ev.instanceId = ev.instanceId ?? 'observatory-platform'
  ev.hostType = ev.hostType ?? 'dsh'
  ev.system = ev.system ?? 'digital-architect'
  const dir = join(EVENTS_DIR, ev.instanceId)
  mkdirSync(dir, { recursive: true })
  const day = ev.ts.slice(0, 10)
  writeFileSync(join(dir, `${day}.ndjson`), JSON.stringify(ev) + '\n', { flag: 'a' })
}

// ---- HTTP ----
function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'public', 'index.html')))
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/snapshot') return sendJson(res, 200, snapshot())
    if (req.method === 'POST' && url.pathname === '/api/govern/task') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy() })
      req.on('end', () => {
        try {
          const { taskId, root, action, by } = JSON.parse(body || '{}')
          if (!taskId || !root || !['confirm', 'reject'].includes(action)) throw new Error('参数不合法')
          sendJson(res, 200, governTask(taskId, root, action, by || '主人'))
        } catch (e) { sendJson(res, 400, { ok: false, error: e.message }) }
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/govern/knowledge') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy() })
      req.on('end', () => {
        try {
          const { entry, to } = JSON.parse(body || '{}')
          if (!entry || to !== '已确认') throw new Error('参数不合法')
          sendJson(res, 200, promoteKnowledge(entry, to))
        } catch (e) { sendJson(res, 400, { ok: false, error: e.message }) }
      })
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (e) { sendJson(res, 500, { error: e.message }) }
})

// ---- 数据面 watch（变更即重聚合；聚合本身惰性，watch 只做日志提示与快照预热）----
try {
  watch(OBS, { recursive: true }, () => { /* 惰性聚合：/api/snapshot 每次现读 */ })
} catch { /* obs 未就绪时容忍 */ }

mkdirSync(INSTANCES_DIR, { recursive: true })
mkdirSync(EVENTS_DIR, { recursive: true })
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[observatory] 看板 http://127.0.0.1:${PORT}  数据根 ${OBS}`)
  appendEvent({ domain: 'platform', type: 'platform.started', severity: 'info', subject: `observatory@${PORT}` })
})
