#!/usr/bin/env node
/**
 * server.mjs — Architect Observatory 平台服务（零 npm 依赖）。
 *
 * 数据面：watch obs/（实例注册+事件流）+ docs/tasks（台账）+ review-queue → 内存聚合。
 * 治理面：POST /api/govern/* → 调 task-ledger.mjs CLI（不旁路四不变量）+ 发 governance.* 审计事件。
 * 看板：public/index.html（GET /），绑定 127.0.0.1:8787。
 *
 * 用法：node server.mjs [--root <总仓根>] [--data <数据根>] [--port 8787] [--tasks <dir>]... [--agentdb <path>]
 *   --root 若省略 = 脚本上级目录；--data 若省略 = <root>/obs
 *   --data 独立于 --root，便于在临时数据根上做无副作用端到端验证（总仓知识库/告警规则仍按 --root 读取）。
 */
import http from 'node:http'
import { watch, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync, unlinkSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { readYuyiFace } from './yuyi-ingest.mjs'
import { beatInstance } from './instance-beat.mjs'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
// 总仓根（知识库/告警规则/缺省 tasks 与 agent.db）与数据根（instances/events/approvals/archive）
let ROOT = resolve(SCRIPT_DIR, '..')
let OBS = join(ROOT, 'obs')
let PORT = 8787
// 台账目录（可重复 --tasks <dir>）：yaml 现值为权威状态源，事件流提供历史轨迹
const TASK_DIRS = []
// 由平台进程维护心跳的本地实例（--heartbeat a,b）：心跳内建，**不需要**独立进程或计划任务
const HEARTBEAT_INSTANCES = []
// 运行时库（omp agent.db，只读摄取；缺省 docker/omp/agent/agent.db）
let AGENT_DB = null
// 告警抑制窗口（同一规则 N ms 内不重复入库/通知；抑制状态仍呈现但标记 suppressed）
let ALERT_COOLDOWN_MS = 10 * 60 * 1000
{
  const argv = process.argv
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') ROOT = resolve(argv[++i])
    else if (argv[i] === '--data') OBS = resolve(argv[++i])
    else if (argv[i] === '--port') PORT = Number(argv[++i])
    else if (argv[i] === '--tasks') TASK_DIRS.push(argv[++i])
    else if (argv[i] === '--heartbeat') HEARTBEAT_INSTANCES.push(...String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean))
    else if (argv[i] === '--agentdb') AGENT_DB = argv[++i]
    else if (argv[i] === '--alert-cooldown-ms') ALERT_COOLDOWN_MS = Number(argv[++i])
  }
}
if (AGENT_DB === null) AGENT_DB = join(ROOT, 'docker', 'omp', 'agent', 'agent.db')
const INSTANCES_DIR = join(OBS, 'instances')
const EVENTS_DIR = join(OBS, 'events')
const HEARTBEAT_FACTOR = 3
// 告警状态（进程内：抑制窗口与触发计数；历史落 obs/alerts-history.ndjson）
const alertState = {}

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
// ---- 知识库只读摄取（architect-knowledge 五类目录，frontmatter 轻解析，零依赖）----
function loadKnowledgeBase() {
  const base = join(ROOT, 'architect-knowledge')
  const entries = []
  for (const cat of ['meta', 'principle', 'scenario', 'practice', 'reference']) {
    let files = []
    try { files = readdirSync(join(base, cat)).filter((f) => f.endsWith('.md') && f !== 'index.md') } catch { continue }
    for (const f of files) {
      let raw = ''
      let mtime = ''
      try {
        raw = readFileSync(join(base, cat, f), 'utf8')
        mtime = statSync(join(base, cat, f)).mtime.toISOString()
      } catch { continue }
      const fm = {}
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
      if (m) for (const line of m[1].split(/\r?\n/)) {
        const kv = line.match(/^([A-Za-z]\w*):\s*(.+)$/)
        if (kv) fm[kv[1]] = kv[2].trim()
      }
      entries.push({
        category: cat, file: `${cat}/${f}`,
        title: fm.title || f.replace(/\.md$/, ''),
        status: fm.status || '未知',
        domain: fm.domain || '',
        confirmed: fm.confirmed || '', updated: fm.updated || '',
        mtime,
      })
    }
  }
  const byCategory = {}, byStatus = {}
  for (const e of entries) {
    byCategory[e.category] = (byCategory[e.category] || 0) + 1
    byStatus[e.status] = (byStatus[e.status] || 0) + 1
  }
  const recentKey = (e) => e.updated || e.confirmed || e.mtime
  const recent = [...entries].sort((a, b) => recentKey(b).localeCompare(recentKey(a))).slice(0, 8)
  const list = [...entries].sort((a, b) => a.category.localeCompare(b.category) || a.file.localeCompare(b.file))
  return { total: entries.length, byCategory, byStatus, recent, entries: list }
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

/**
 * 协作面汇总（§7.2.1 御驿消息结构化）：按对端身份聚合 collab.message 事件。
 * 身份字段全部来自实例转写的 Yuyi Hub 权威回填值（peerAgentId/peerOwner/peerRole）；
 * peerAgentId 缺席即「身份未验证」——平台如实呈现，不推测、不补全。
 */
function summarizeCollab(events) {
  const peers = {}
  let denied = 0
  for (const e of events) {
    const t = String(e.type)
    if (t.startsWith('collab.gate-denied')) { denied++; continue }
    if (!t.startsWith('collab.message')) continue
    const verified = typeof e.peerAgentId === 'string' && e.peerAgentId !== ''
    const key = verified ? e.peerAgentId : `未验证:${e.peerName || e.peerDevice || '未知'}`
    const p = peers[key] || (peers[key] = {
      peerKey: key, agentId: verified ? e.peerAgentId : '', owner: '', role: '',
      device: e.peerDevice || '', name: e.peerName || '',
      inbound: 0, outbound: 0, identityVerified: verified, systems: {}, lastTs: '', lastSubject: '',
    })
    if (e.direction === 'inbound') p.inbound++
    else if (e.direction === 'outbound') p.outbound++
    if (verified) p.identityVerified = true
    p.systems[e.system] = (p.systems[e.system] || 0) + 1
    if (!p.lastTs || String(e.ts) >= p.lastTs) {
      p.lastTs = String(e.ts)
      p.lastSubject = e.subject ?? ''
      if (verified) p.agentId = e.peerAgentId
      if (typeof e.peerOwner === 'string' && e.peerOwner) p.owner = e.peerOwner
      if (typeof e.peerRole === 'string' && e.peerRole) p.role = e.peerRole
      if (e.peerDevice) p.device = e.peerDevice
      if (e.peerName) p.name = e.peerName
    }
  }
  const list = Object.values(peers).sort((a, b) => (b.inbound + b.outbound) - (a.inbound + a.outbound))
  return {
    peers: list,
    totals: {
      peers: list.length,
      verified: list.filter((p) => p.identityVerified).length,
      unverified: list.filter((p) => !p.identityVerified).length,
      inbound: list.reduce((n, p) => n + p.inbound, 0),
      outbound: list.reduce((n, p) => n + p.outbound, 0),
      gateDenied: denied,
    },
  }
}

/**
 * 身份自验面（§7.1 身份三态之「自验」）：取每实例最新的 platform.identity.verified 证据。
 * 平台只存档与呈现，不做验证、不持有御符凭证；验证由实例侧调 yufu_verify 完成后上报。
 * drift：同一 instanceId 先后自验出**不同御符 id** → 身份漂移嫌疑，显式提示。
 * （注册 id `<宿主>-<职责>-<序号>` 与御符 id `yf-*` 本就不同形，故不作跨形比较。）
 */
function summarizeIdentity(events, instances) {
  const latest = {}
  const seenIds = {}
  for (const e of events) {
    if (e.domain !== 'platform' || !String(e.type).startsWith('platform.identity.verified')) continue
    const prev = latest[e.instanceId]
    if (!prev || String(e.ts) >= String(prev.ts)) latest[e.instanceId] = e
    if (typeof e.identityId === 'string' && e.identityId !== '') (seenIds[e.instanceId] || (seenIds[e.instanceId] = new Set())).add(e.identityId)
  }
  const rows = Object.values(instances).map((i) => {
    const e = latest[i.instanceId]
    const ids = [...(seenIds[i.instanceId] || [])]
    const drift = ids.length > 1 ? `身份漂移：同一实例先后自验为 ${ids.join(' / ')}` : ''
    if (!e) return { instanceId: i.instanceId, state: '未申报', identityId: '', owner: '', role: '', permissions: [], via: '', checkedAt: '', ageSec: null, reason: '', drift }
    return {
      instanceId: i.instanceId,
      state: e.verified ? '已验证' : '失效',
      identityId: typeof e.identityId === 'string' ? e.identityId : '',
      owner: e.owner || '',
      role: e.role || '',
      permissions: Array.isArray(e.permissions) ? e.permissions : [],
      via: e.via || '',
      checkedAt: e.ts || '',
      ageSec: Math.round((Date.now() - (Date.parse(e.ts) || 0)) / 1000),
      reason: e.reason || '',
      drift,
    }
  })
  return {
    rows,
    totals: {
      verified: rows.filter((r) => r.state === '已验证').length,
      failed: rows.filter((r) => r.state === '失效').length,
      unreported: rows.filter((r) => r.state === '未申报').length,
    },
  }
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
  // 治理地址簿：登记项并入实例实时状态（offline 实例仍可治理其台账——状态只影响提示）
  const roots = DATA_ROOTS.list.map((r) => ({
    instanceId: r.instanceId,
    taskRoot: r.taskRoot || '',
    label: r.label || '',
    status: instances[r.instanceId]?.status ?? 'unknown',
    systems: instances[r.instanceId]?.systems ?? [],
  }))
  return { generatedAt: new Date().toISOString(), instances: Object.values(instances), events: events.slice(-500), tasks, reviewQueue: rq, alerts: critical.slice(-50), governance: governance.slice(-50), collab: summarizeCollab(events.filter((e) => e.domain === 'collab')), identity: summarizeIdentity(events, instances), yuyi: readYuyiFace(), knowledgeBase: loadKnowledgeBase(), roots, addressBookSource: DATA_ROOTS.source, lastError: state.lastError }
}

// ---- 治理操作（经 task-ledger CLI，不旁路四不变量）----
function governTask(taskId, root, action, by) {
  const sub = action === 'confirm' ? 'confirm' : action === 'reject' ? 'reject' : null
  if (!sub) throw new Error(`未知治理动作：${action}`)
  // 纵深防线：即使绕过路由层，函数层也拒绝无操作者的治理调用（不得代填「主人」）
  if (typeof by !== 'string' || by.trim() === '') throw new Error('治理操作必须显式提供操作者标识 by（平台不代填「主人」）')
  // 台账脚本随目标项目走：<root>/scripts/task-ledger.mjs；confirm 须带来源（--confirmed-by/--confirmed-via）
  const args = [join(root, 'scripts', 'task-ledger.mjs'), sub, '--id', taskId, '--by', by, '--confirmed-by', by, '--confirmed-via', 'observatory', '--root', root]
  const out = execFileSync('node', args, { encoding: 'utf8' })
  appendEvent({ domain: 'governance', type: `governance.${action}`, severity: 'info', subject: taskId, payload: { by, via: 'observatory', out: out.slice(-200) } })
  return { ok: true, out: out.slice(-500) }
}
function promoteKnowledge(entry, to, by) {
  const file = join(ROOT, 'architect-knowledge', 'practice', `${entry}.md`)
  let c = readFileSync(file, 'utf8')
  c = c.replace(/status:\s*(待审核|已确认)/, `status: ${to}`)
  writeFileSync(file, c)
  appendEvent({ domain: 'governance', type: 'governance.knowledge-promote', severity: 'info', subject: entry, payload: { to, by, via: 'observatory' } })
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

// ---- 运行时层：omp agent.db 只读摄取（node:sqlite，零 npm 依赖）----
// 零依赖的极简 YAML 解析（顶层 `<key>:` + `  - k: v` 列表形态；key 缺省 rules，向后兼容 alert-rules.yml）
const YAML = { parse: (txt, key = 'rules') => {
  const out = { [key]: [] }
  const headRe = new RegExp(`^${key}:\\s*$`)
  let cur = null
  const unquote = (v) => {
    const t = v.trim()
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1)
    return t
  }
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (line.trim() === '' || /^\s*#/.test(line)) continue
    if (headRe.test(line.trim())) continue
    const item = line.match(/^\s*-\s+([\w-]+):\s*(.*)$/)   // 列表项起始（- id: xxx）
    if (item) { cur = {}; cur[item[1]] = unquote(item[2]); out[key].push(cur); continue }
    const kv = line.match(/^\s+([\w-]+):\s*(.*)$/)         // 同级续行（when/severity/title/message）
    if (kv && cur) { cur[kv[1]] = unquote(kv[2]); continue }
  }
  return out
} }
// ---- 治理地址簿（data-roots.yml）：跨实例统一治理的选择器来源 ----
// 实例在容器/会话内看到的路径 ≠ 平台宿主路径，故显式登记；缺失时治理页仍支持手输 root。
const DATA_ROOTS = (() => {
  const p = join(ROOT, 'observatory', 'data-roots.yml')
  if (!existsSync(p)) return { list: [], source: null }
  try { return { list: YAML.parse(readFileSync(p, 'utf8'), 'roots').roots || [], source: p } } catch (e) { return { list: [], source: p, error: e.message } }
})()
// 真实台账判定：root 命中治理地址簿即视为生产台账（自动化调用须显式 confirmReal=true）
// 背景：2026-09-12 两次误操作（负测误对生产台账执行 confirm），此防线防止脚本/自动化重犯。
function isRealLedger(root) {
  const norm = (p) => String(p || '').replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase()
  return DATA_ROOTS.list.some((r) => r.taskRoot && norm(r.taskRoot) === norm(root))
}
// ---- 告警规则（alert-rules.yml）加载与评估 ----
const ALERT_RULES = (() => {
  const p = join(ROOT, 'observatory', 'alert-rules.yml')
  if (!existsSync(p)) return { list: [], source: null }
  try {
    return { list: YAML.parse(readFileSync(p, 'utf8')).rules || [], source: p }
  } catch (e) { return { list: [], source: p, error: e.message } }
})()
function evaluateAlerts(snap) {
  if (ALERT_RULES.list.length === 0) return []
  const ctx = { events: snap.events, instances: snap.instances, tasks: snap.tasks, Date, Object, JSON, now: Date.now() }
  const out = []
  const COOLDOWN_MS = ALERT_COOLDOWN_MS
  for (const r of ALERT_RULES.list) {
    try {
      const fn = new Function(...Object.keys(ctx), `return (${r.when})`)
      if (fn(...Object.values(ctx))) {
        const st = alertState[r.id] ?? (alertState[r.id] = { lastFiredAt: 0, count: 0 })
        const now = Date.now()
        const suppressed = now - st.lastFiredAt < COOLDOWN_MS
        if (!suppressed) {
          st.lastFiredAt = now
          st.count++
          recordAlertHistory({ ts: new Date(now).toISOString(), id: r.id, severity: r.severity, title: r.title, message: r.message })
        }
        out.push({ id: r.id, severity: r.severity, title: r.title, message: r.message, suppressed, firedCount: st.count })
      }
    } catch (e) {
      // 规则求值失败不静默：以 warning 快照呈现（fail-loud，与本项目纪律一致）
      out.push({ id: r.id, severity: 'warning', title: `告警规则求值失败：${r.id}`, message: String(e && e.message || e), suppressed: false, firedCount: 0, ruleError: true })
    }
  }
  return out
}

function recordAlertHistory(entry) {
  try {
    mkdirSync(OBS, { recursive: true })
    appendFileSync(join(OBS, 'alerts-history.ndjson'), JSON.stringify(entry) + '\n')
  } catch { /* 历史写入失败不影响告警呈现 */ }
}

// ---- 审计归档（哈希链封印；完整内容校验走 seal.mjs --verify）----
function archiveSnapshot() {
  const sealsFile = join(OBS, 'archive', 'seals.ndjson')
  if (!existsSync(sealsFile)) return { seals: 0, chainOk: null, last: null, note: '尚无封印（node observatory/seal.mjs）' }
  const seals = readFileSync(sealsFile, 'utf8').split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  let chainOk = true
  let prev = 'GENESIS'
  for (const s of seals) {
    const expect = createHash('sha256').update(prev).update('|').update(s.day).update('|').update(s.sha256).digest('hex')
    if (s.prevSha !== prev || expect !== s.chainSha) { chainOk = false; break }
    prev = s.chainSha
  }
  const last = seals[seals.length - 1]
  return {
    seals: seals.length,
    chainOk,
    last: last ? { day: last.day, closed: !!last.closed, files: last.files, bytes: last.bytes, ts: last.ts } : null,
    note: '完整内容一致性校验：node observatory/seal.mjs --verify',
  }
}

function healthSnapshot() {
  const startedAt = process.uptime()
  const probe = (fn) => { try { fn(); return 'ok' } catch (e) { return `error: ${e.message}` } }
  return {
    ok: true,
    pid: process.pid,
    version: 'observatory/1',
    uptimeSec: Math.round(startedAt),
    startedAt: new Date(Date.now() - startedAt * 1000).toISOString(),
    sources: {
      instances: probe(() => readdirSync(INSTANCES_DIR)),
      events: probe(() => readdirSync(EVENTS_DIR)),
      tasks: TASK_DIRS.length === 0 ? 'disabled' : probe(() => readdirSync(TASK_DIRS[0])),
      runtime: probe(() => { const db = new DatabaseSync(AGENT_DB, { readOnly: true }); db.prepare('SELECT 1').all(); db.close() }),
      approvals: probe(() => readdirSync(APPROVALS_PENDING_DIR)),
      // 御驿协作面（只读摄取 ~/.yuyi）：接入则 ok，未接入则该机无此数据源（disabled 语义）
      yuyi: (() => { try { const f = readYuyiFace(); return f.available ? 'ok' : 'disabled' } catch (e) { return `error: ${e.message}` } })(),
    },
    taskDirs: TASK_DIRS,
    agentDb: AGENT_DB,
    lastError: state.lastError,
    alertRules: ALERT_RULES.list.length,
  }
}

// ---- 审批代办（pending 扫描 + 决定写入 + 事件发射）----
const APPROVALS_PENDING_DIR = join(OBS, 'approvals', 'pending')
const APPROVALS_DECISIONS_DIR = join(OBS, 'approvals', 'decisions')
function scanPending() {
  const out = []
  try {
    for (const f of readdirSync(APPROVALS_PENDING_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const raw = readFileSync(join(APPROVALS_PENDING_DIR, f), 'utf8')
        const p = JSON.parse(raw)
        const expired = p.requiredBy && Date.parse(p.requiredBy) < Date.now()
        if (expired) { writeAutoDecision(p, 'deny', 'system-timeout', '审批超时自动拒绝（主人未在 requiredBy 前决断）'); continue }
        out.push({ requestId: p.requestId, ts: p.ts, instanceId: p.instanceId, tool: p.subject?.tool, reason: p.reason, requiredBy: p.requiredBy, subject: p.subject })
      } catch { /* 单条损坏不阻断 */ }
    }
  } catch { /* 目录不存在：跳过 */ }
  return out
}
function writeAutoDecision(pending, decision, by, reason) {
  try {
    mkdirSync(APPROVALS_DECISIONS_DIR, { recursive: true })
    const id = pending.requestId
    writeFileSync(join(APPROVALS_DECISIONS_DIR, `${id}.json`), JSON.stringify({ requestId: id, ts: new Date().toISOString(), decision, by, via: 'observatory-auto', reason }, null, 2))
    appendFileSync(join(EVENTS_DIR, pending.instanceId, new Date().toISOString().slice(0, 10) + '.ndjson'), JSON.stringify({ ts: new Date().toISOString(), instanceId: pending.instanceId, hostType: pending.hostType || 'dsh', system: pending.system || 'digital-architect', domain: 'runtime', type: 'approval.resolved', severity: decision === 'deny' ? 'warning' : 'info', subject: id, payload: { decision, by, reason, via: 'observatory-auto' } }) + '\n')
    try { unlinkSync(join(APPROVALS_PENDING_DIR, `${id}.json`)) } catch { /* 保留供事后审计 */ }
  } catch (e) { console.error('[observatory] auto-decision 失败:', e.message) }
}

function runtimeSnapshot() {
  if (!existsSync(AGENT_DB)) return { available: false, reason: `agent.db 不存在：${AGENT_DB}` }
  try {
    const db = new DatabaseSync(AGENT_DB, { readOnly: true })
    try {
      const perf = db.prepare('SELECT model_key, samples, output_tokens, gen_ms, ttft_samples, ttft_ms, updated_at FROM model_perf ORDER BY samples DESC').all()
      const usage = db.prepare('SELECT model_key, last_used_at FROM model_usage').all()
      return {
        available: true,
        models: perf.map((r) => ({
          model: r.model_key,
          samples: r.samples,
          outputTokens: Math.round(r.output_tokens ?? 0),
          avgGenMs: r.samples > 0 ? Math.round(r.gen_ms / r.samples) : 0,
          avgTtftMs: r.ttft_samples > 0 ? Math.round(r.ttft_ms / r.ttft_samples) : 0,
          lastUsedAt: usage.find((u) => u.model_key === r.model_key)?.last_used_at ?? null,
        })),
      }
    } finally { db.close() }
  } catch (e) { return { available: false, reason: e.message } }
}

// ---- HTTP 上报端点（二期：契约校验 + append 到 obs/events/http/）----
function httpIngest(body) {
  const events = Array.isArray(body) ? body : [body]
  const problems = []
  const valid = []
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    // 逐事件局部判定：混批时不得因前序事件通过而放行后序坏事件（历史 bug 已修）
    const local = []
    for (const k of ['ts', 'instanceId', 'hostType', 'system', 'domain', 'type', 'severity']) {
      if (typeof ev[k] !== 'string' || ev[k] === '') local.push(`#${i} 缺必填 ${k}`)
    }
    // 域约定（与 contracts/validate.mjs 同源）：collab.message 须带 direction
    if (ev.domain === 'collab' && typeof ev.type === 'string' && ev.type.startsWith('collab.message') && ev.direction !== 'inbound' && ev.direction !== 'outbound') {
      local.push(`#${i} collab.message 须带 direction(inbound|outbound)：${ev.direction}`)
    }
    if (local.length > 0) problems.push(...local)
    else valid.push(ev)
  }
  if (valid.length > 0) {
    const dir = join(EVENTS_DIR, 'http')
    mkdirSync(dir, { recursive: true })
    const day = new Date().toISOString().slice(0, 10)
    appendFileSync(join(dir, `${day}.ndjson`), valid.map((e) => JSON.stringify(e)).join('\n') + '\n')
  }
  return { accepted: valid.length, rejected: events.length - valid.length, problems }
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
    if (req.method === 'GET' && url.pathname === '/api/snapshot') {
      const snap = { ...snapshot(), runtime: runtimeSnapshot() }
      snap.alerts = evaluateAlerts(snap)
      snap.pendingApprovals = scanPending()
      return sendJson(res, 200, snap)
    }
    if (req.method === 'GET' && url.pathname === '/api/runtime') return sendJson(res, 200, runtimeSnapshot())
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, healthSnapshot())
    if (req.method === 'GET' && url.pathname === '/api/archive') return sendJson(res, 200, archiveSnapshot())
    if (req.method === 'GET' && url.pathname === '/api/alerts-history') {
      const p = join(OBS, 'alerts-history.ndjson')
      const items = existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).slice(-100).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean) : []
      return sendJson(res, 200, { count: items.length, items })
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 1000)
      const inst = url.searchParams.get('instanceId')
      const all = loadEvents().filter((e) => !inst || e.instanceId === inst)
      return sendJson(res, 200, { total: all.length, items: all.slice(-limit) })
    }
    if (req.method === 'POST' && url.pathname === '/api/events') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 262144) req.destroy() })
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}')
          const events = Array.isArray(parsed) ? parsed : parsed.events ?? [parsed]
          sendJson(res, 200, httpIngest(events))
        } catch (e) { sendJson(res, 400, { error: e.message }) }
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/govern/task') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy() })
      req.on('end', () => {
        try {
          const { taskId, root, action, by, confirmReal } = JSON.parse(body || '{}')
          if (!taskId || !root || !['confirm', 'reject'].includes(action)) throw new Error('参数不合法')
          // 操作者必须显式提供：平台不得默认代填「主人」（confirm 只能由主人发起，见 2026-09-12 误操作事件）
          if (typeof by !== 'string' || by.trim() === '') throw new Error('治理操作必须显式提供 by（操作者标识）；平台不代填「主人」')
          // 生产台账防线：脚本/自动化路径必须显式声明，防止负测与自动化误写真实台账
          if (isRealLedger(root) && confirmReal !== true) throw new Error(`拒绝：${root} 是治理地址簿登记的真实台账。脚本/自动化调用须显式带 confirmReal=true（经看板人工操作会自动携带）；此防线源于 2026-09-12 两次负测误写生产台账的教训`)
          sendJson(res, 200, governTask(taskId, root, action, by.trim()))
        } catch (e) { sendJson(res, 400, { ok: false, error: e.message }) }
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/govern/approval') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy() })
      req.on('end', () => {
        try {
          const { requestId, decision, by, reason } = JSON.parse(body || '{}')
          if (!requestId || !['allow', 'deny'].includes(decision)) throw new Error('参数不合法（需 requestId 与 decision=allow|deny）')
          if (typeof by !== 'string' || by.trim() === '') throw new Error('审批必须显式提供 by（操作者标识）；平台不代填「主人」')
          const operator = by.trim()
          const ppath = join(APPROVALS_PENDING_DIR, `${requestId}.json`)
          if (!existsSync(ppath)) throw new Error('挂单不存在或已处理')
          const pending = JSON.parse(readFileSync(ppath, 'utf8'))
          mkdirSync(APPROVALS_DECISIONS_DIR, { recursive: true })
          writeFileSync(join(APPROVALS_DECISIONS_DIR, `${requestId}.json`), JSON.stringify({ requestId, ts: new Date().toISOString(), decision, by: operator, via: 'observatory', reason: reason || '' }, null, 2))
          appendFileSync(join(EVENTS_DIR, pending.instanceId, new Date().toISOString().slice(0, 10) + '.ndjson'), JSON.stringify({ ts: new Date().toISOString(), instanceId: pending.instanceId, hostType: pending.hostType || 'dsh', system: pending.system || 'digital-architect', domain: 'runtime', type: 'approval.resolved', severity: decision === 'deny' ? 'warning' : 'info', subject: requestId, payload: { decision, by: operator, via: 'observatory', reason: reason || '' } }) + '\n')
          try { unlinkSync(ppath) } catch { /* 保留供审计 */ }
          sendJson(res, 200, { ok: true, requestId, decision })
        } catch (e) { sendJson(res, 400, { ok: false, error: e.message }) }
      })
      return
    }
    if (req.method === 'POST' && url.pathname === '/api/govern/knowledge') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy() })
      req.on('end', () => {
        try {
          const { entry, to, by } = JSON.parse(body || '{}')
          if (!entry || to !== '已确认') throw new Error('参数不合法')
          if (typeof by !== 'string' || by.trim() === '') throw new Error('知识条目升级必须显式提供 by（操作者标识）；平台不代填「主人」')
          sendJson(res, 200, promoteKnowledge(entry, to, by.trim()))
        } catch (e) { sendJson(res, 400, { ok: false, error: e.message }) }
      })
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (e) { sendJson(res, 500, { error: e.message }) }
})

// ---- 平台自注册与心跳（平台自身也是一个可见实例：谁在看）----
const SELF_INSTANCE_ID = 'observatory-platform'
function writeSelfHeartbeat() {
  try {
    mkdirSync(INSTANCES_DIR, { recursive: true })
    writeFileSync(join(INSTANCES_DIR, `${SELF_INSTANCE_ID}.yaml`), [
      `instanceId: ${SELF_INSTANCE_ID}`,
      'hostType: dsh',
      'host: dsh 桌面宿主（平台自身）',
      'systems: [digital-architect]',
      'capabilities: [observability, governance, alerting]',
      'status: online',
      `lastSeenAt: ${new Date().toISOString()}`,
      'heartbeatIntervalSec: 30',
      '',
    ].join('\n'))
    // 心跳内建：由本进程顺带刷新 --heartbeat 指定的本地实例（不再需要独立心跳进程/计划任务）
    for (const id of HEARTBEAT_INSTANCES) {
      try { beatInstance(join(INSTANCES_DIR, `${id}.yaml`), 30) } catch { /* 单实例失败不影响其余 */ }
    }
  } catch { /* 心跳写入失败不影响服务 */ }
}
writeSelfHeartbeat()
setInterval(writeSelfHeartbeat, 30_000)

// ---- 数据面 watch（变更即重聚合；聚合本身惰性，watch 只做日志提示与快照预热）----
try {
  watch(OBS, { recursive: true }, () => { /* 惰性聚合：/api/snapshot 每次现读 */ })
} catch { /* obs 未就绪时容忍 */ }

mkdirSync(INSTANCES_DIR, { recursive: true })
mkdirSync(EVENTS_DIR, { recursive: true })
// 运行期状态目录预建：新数据根开箱即健康（历史缺陷：缺 approvals/ 时健康端点报 ENOENT）
mkdirSync(APPROVALS_PENDING_DIR, { recursive: true })
mkdirSync(APPROVALS_DECISIONS_DIR, { recursive: true })
mkdirSync(join(OBS, 'archive'), { recursive: true })
// PID 登记（精确管理面：按 <数据根>/server.pid 启停，禁按进程名批量杀）
// 归属数据根而非脚本目录：多实例/临时数据根并存时互不覆盖（历史缺陷：临时实例会覆盖主实例登记）。
const PID_FILE = join(OBS, 'server.pid')
try { writeFileSync(PID_FILE, String(process.pid)) } catch { /* 登记失败不阻断启动 */ }
const cleanupPid = () => { try { unlinkSync(PID_FILE) } catch { /* 已不存在或目录只读 */ } }
process.on('exit', cleanupPid)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanupPid(); process.exit(0) })
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[observatory] 看板 http://127.0.0.1:${PORT}  数据根 ${OBS}`)
  appendEvent({ domain: 'platform', type: 'platform.started', severity: 'info', subject: `observatory@${PORT}` })
})
