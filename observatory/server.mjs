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
 * Model B / C2：--brain <url|路径> 启用大脑仓 git 镜像（知识面独立；镜像缺省 <数据根>/brain-mirror，
 *   --brain-dir 改位置，--brain-sync-sec 改同步周期；知识升级经镜像 commit+push，冲突拒写呈报）。
 */
import http from 'node:http'
import { watch, existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, appendFileSync, unlinkSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readYuyiFace } from './yuyi-ingest.mjs'
import { beatInstance } from './instance-beat.mjs'
import { ensureBrainMirror, syncBrainMirror, commitAndPushBrain, brainStatus } from './brain-mirror.mjs'
import { createTranscriber } from './yuyi-transcribe.mjs'
import { homedir } from 'node:os'

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
// —— 访问与上报认证（多宿主上报架构，2026-09-12 主人拍板实施）——
// --host：监听地址（缺省 127.0.0.1 本机信任模式）；绑定非回环即进入受保护模式
// 受保护模式强制要求 --admin-token（查看/治理）与 --yufu-url（上报者御符 token 验证），缺失拒绝启动
let HOST = '127.0.0.1'
let ADMIN_TOKEN = ''
let AUTH_YUFU_URL = process.env.OBS_YUFU_URL || ''
let REQUIRE_TOKEN = false
// —— Model B / C2 大脑仓 git 镜像（知识面独立）——
// --brain <url|路径> 启用镜像：知识面（architect-knowledge/评审队列）改读镜像，fetch+ff-only 只读同步；
// 知识升级 = 镜像内 commit+push（git 为权威）；冲突 → 回滚拒写并呈报主人。未启用 = 随仓直读（现状不变）。
let BRAIN_URL = ''
let BRAIN_DIR = ''
let BRAIN_SYNC_SEC = 300
let YUYI_TRANSCRIBE_OFF = false
{
  const argv = process.argv
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') ROOT = resolve(argv[++i])
    else if (argv[i] === '--data') OBS = resolve(argv[++i])
    else if (argv[i] === '--port') PORT = Number(argv[++i])
    else if (argv[i] === '--host') HOST = argv[++i]
    else if (argv[i] === '--tasks') TASK_DIRS.push(argv[++i])
    else if (argv[i] === '--heartbeat') HEARTBEAT_INSTANCES.push(...String(argv[++i]).split(',').map((s) => s.trim()).filter(Boolean))
    else if (argv[i] === '--agentdb') AGENT_DB = argv[++i]
    else if (argv[i] === '--alert-cooldown-ms') ALERT_COOLDOWN_MS = Number(argv[++i])
    else if (argv[i] === '--admin-token') ADMIN_TOKEN = argv[++i]
    else if (argv[i] === '--yufu-url') AUTH_YUFU_URL = argv[++i]
    else if (argv[i] === '--require-token') REQUIRE_TOKEN = true
    else if (argv[i] === '--brain') BRAIN_URL = argv[++i]
    else if (argv[i] === '--brain-dir') BRAIN_DIR = argv[++i]
    else if (argv[i] === '--brain-sync-sec') BRAIN_SYNC_SEC = Number(argv[++i])
    else if (argv[i] === '--no-yuyi-transcribe') YUYI_TRANSCRIBE_OFF = true
  }
}
if (BRAIN_URL && !BRAIN_DIR) BRAIN_DIR = join(OBS, 'brain-mirror')
// 知识面寻址（C2）：镜像模式读 <镜像>/architect-knowledge，随仓读 <ROOT>/architect-knowledge（与 C1 配置寻址同思路）
const knowledgeBaseRoot = () => (BRAIN_URL ? BRAIN_DIR : ROOT)
const isLoopbackHost = (h) => h === 'localhost' || h === '::1' || /^127\./.test(h)

// —— 配置寻址（Model B / C1 配置解耦）——
// 独立部署时配置放 <数据根>/config/；随仓部署回退 observatory/。寻址顺序：数据根 → 包内 → 仓内
const SCRIPT_DIR0 = dirname(fileURLToPath(import.meta.url))
const configPath = (name) => {
  const inData = join(OBS, 'config', name)
  if (existsSync(inData)) return inData
  const inPkg = join(SCRIPT_DIR0, 'config', name)
  if (existsSync(inPkg)) return inPkg
  return join(ROOT, 'observatory', name)
}
const SECURED = REQUIRE_TOKEN || !isLoopbackHost(HOST)
// 受保护模式 fail-fast：缺配置直接拒绝启动（不得半暴露）
if (SECURED && !isLoopbackHost(HOST) && !ADMIN_TOKEN) {
  console.error('[observatory] 拒绝启动：绑定非回环地址必须提供 --admin-token（查看/治理凭据）。本机信任模式请用默认 127.0.0.1。')
  process.exit(2)
}
if (SECURED && REQUIRE_TOKEN && !AUTH_YUFU_URL) {
  console.error('[observatory] 拒绝启动：--require-token 需要同时提供 --yufu-url <御符地址>（用于验证上报者 token）。')
  process.exit(2)
}
// 上报者 token 验证缓存：键=token 摘要，值={ok,agentId,at}；仅内存，10 分钟 TTL，不落盘不打印
const reporterCache = new Map()
const TOKEN_TTL_MS = 10 * 60 * 1000
async function verifyReporter(authorization) {
  const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return { ok: false, why: '缺少 Authorization: Bearer <token>' }
  const key = createHash('sha256').update(token).digest('hex').slice(0, 24)
  const hit = reporterCache.get(key)
  if (hit && Date.now() - hit.at < TOKEN_TTL_MS) return hit
  let result = { ok: false, agentId: '', at: Date.now(), why: '' }
  try {
    const res = await fetch(`${AUTH_YUFU_URL.replace(/\/$/, '')}/api/v1/auth/agent/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    })
    const j = await res.json().catch(() => ({}))
    const id = j.agent_id || j.agentId || ''
    result = { ok: res.ok && j.valid !== false && Boolean(id), agentId: id, at: Date.now(), why: res.ok ? '御符返回 valid=false 或缺 agent_id' : `御符 HTTP ${res.status}` }
  } catch (e) { result = { ok: false, agentId: '', at: Date.now(), why: `御符验证请求失败：${e.message}` } }
  reporterCache.set(key, result)
  if (reporterCache.size > 500) reporterCache.clear()
  return result
}
const safeEq = (a, b) => {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b))
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}
function adminOk(req) {
  if (!ADMIN_TOKEN) return !SECURED // 未配置令牌时仅本机信任模式放行
  return safeEq(req.headers['x-obs-admin'] || '', ADMIN_TOKEN)
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
    const raw = readFileSync(join(knowledgeBaseRoot(), 'architect-knowledge', 'review-queue.yaml'), 'utf8')
    return { raw, entries: (raw.match(/- /g) ?? []).length }
  } catch { return { raw: '', entries: 0 } }
}
// ---- 知识库只读摄取（architect-knowledge 五类目录，frontmatter 轻解析，零依赖）----
function loadKnowledgeBase() {
  const base = join(knowledgeBaseRoot(), 'architect-knowledge')
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
  return { generatedAt: new Date().toISOString(), instances: Object.values(instances), events: events.slice(-500), tasks, reviewQueue: rq, alerts: critical.slice(-50), governance: governance.slice(-50), collab: summarizeCollab(events.filter((e) => e.domain === 'collab')), identity: summarizeIdentity(events, instances), yuyi: readYuyiFace(), knowledgeBase: loadKnowledgeBase(), roots, addressBookSource: DATA_ROOTS.source, brain: brainStatus(), governorOrders: govSnapshot(), yuyiTranscribe: { ...yuyiStatus }, lastError: state.lastError }
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
// 知识条目五类解析（修复：原实现硬编码 practice/，非 practice 条目升级会写错路径）
const KB_CATEGORIES = ['meta', 'principle', 'scenario', 'practice', 'reference']
function resolveKnowledgeFile(entry) {
  const base = join(knowledgeBaseRoot(), 'architect-knowledge')
  const name = entry.endsWith('.md') ? entry : `${entry}.md`
  for (const cat of KB_CATEGORIES) {
    const p = name.startsWith(`${cat}/`) ? join(base, name) : join(base, cat, name)
    if (existsSync(p)) return p
  }
  return null
}
function promoteKnowledge(entry, to, by) {
  const file = resolveKnowledgeFile(entry)
  if (!file) throw new Error(`未找到知识条目：${entry}（五类目录解析均未命中）`)
  const c = readFileSync(file, 'utf8')
  if (!/status:\s*(待审核|已确认)/.test(c)) throw new Error('条目缺 status: 待审核|已确认 字段，拒绝盲改')
  const next = c.replace(/status:\s*(待审核|已确认)/, `status: ${to}`)
  let commit = ''
  let plane = 'repo'
  if (BRAIN_URL) {
    // Model B / C2：升级写入大脑仓镜像 → commit + push（git 为权威）；失败/冲突已回滚拒写
    plane = 'brain-mirror'
    const r = commitAndPushBrain({ dir: BRAIN_DIR, message: `知识治理：${entry} → ${to}（via observatory，by ${by}）`, paths: [file], mutate: () => writeFileSync(file, next) })
    if (!r.ok) {
      // 拒写必须留痕呈报：critical 事件是「呈报主人」的持久载体（看板告警区可见）
      appendEvent({ domain: 'platform', type: 'platform.brain.sync', severity: 'critical', subject: entry, payload: { action: 'knowledge-promote-rejected', conflict: Boolean(r.conflict), error: r.error } })
      throw new Error(r.conflict ? `镜像与远端冲突，已拒写并回滚（呈报主人裁决）：${r.error}` : `镜像提交失败（已回滚拒写）：${r.error}`)
    }
    commit = r.commit || ''
  } else {
    writeFileSync(file, next) // 随仓部署：仓即工作副本，git 同步由主人工作流负责（现状行为）
  }
  appendEvent({ domain: 'governance', type: 'governance.knowledge-promote', severity: 'info', subject: entry, payload: { to, by, via: 'observatory', plane, commit } })
  return { ok: true, plane, commit }
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

// ---- Model B / C3 治理指令单（governor 远端执行面）----
// 平台发单（管理员令牌门 + 单号幂等 + HMAC 签名）→ 实例宿主 governor 领单（御符 token 认证）
// → 白名单执行（仅 task-ledger / 文档 status）→ 回执留痕。幂等双重防线：单号全局唯一 +
// governor 本地 executed 集合去重（重复领单不重复执行）。无 GOV_SIGN_KEY 拒绝发单（无签名不发单）。
const GOV_ACTIONS = ['task-ledger', 'doc-status']
const GOV_PENDING_DIR = join(OBS, 'govern-orders', 'pending')
const GOV_DONE_DIR = join(OBS, 'govern-orders', 'done')
const govCanonical = (o) => [o.id, o.instanceId, o.action, JSON.stringify(o.args), o.createdAt].join('|')
const govSign = (payload) => createHmac('sha256', process.env.GOV_SIGN_KEY || '').update(payload).digest('hex')
const govSummary = (action, a) => (action === 'task-ledger' ? `${a.sub} ${a.taskId}` : `${a.file || ''} → ${a.to || ''}`)

function govDispatch({ instanceId, action, by, args }) {
  if (!process.env.GOV_SIGN_KEY) throw new Error('平台未配置 GOV_SIGN_KEY（指令单签名密钥），拒绝发单——无签名不发单')
  if (!instanceId || !GOV_ACTIONS.includes(action)) throw new Error(`参数不合法（action 白名单：${GOV_ACTIONS.join(' / ')}）`)
  if (typeof by !== 'string' || by.trim() === '') throw new Error('发单必须显式提供 by（操作者标识）；平台不代填「主人」')
  const a = { ...args, by: by.trim() }
  delete a.confirmReal // confirmReal 是平台发单防线，不随单下发宿主
  if (action === 'task-ledger') {
    if (!a.taskId || !a.root || !['confirm', 'reject'].includes(a.sub)) throw new Error('task-ledger 单需 taskId / root(宿主视角路径) / sub(confirm|reject)')
    // 与本地治理同一纪律：地址簿登记实例 = 生产台账，自动化发单须显式 confirmReal=true（2026-09-12 防线）
    if (DATA_ROOTS.list.some((r) => r.instanceId === instanceId) && args.confirmReal !== true) throw new Error(`拒绝：${instanceId} 是治理地址簿登记的实例（生产台账）。脚本/自动化发单须显式 confirmReal=true；看板人工发单经二次确认自动携带`)
  }
  if (action === 'doc-status' && (!a.file || !a.to)) throw new Error('doc-status 单需 file / to')
  const order = { id: `GOV-${Date.now()}-${randomBytes(3).toString('hex')}`, instanceId, action, args: a, createdAt: new Date().toISOString() }
  mkdirSync(GOV_PENDING_DIR, { recursive: true })
  writeFileSync(join(GOV_PENDING_DIR, `${order.id}.json`), JSON.stringify({ order, sig: govSign(govCanonical(order)) }, null, 2))
  appendEvent({ domain: 'governance', type: 'governance.dispatch', severity: 'info', subject: order.id, payload: { instanceId, action, by: by.trim(), summary: govSummary(action, a) } })
  return { ok: true, id: order.id }
}

// 领单：返回该实例全部待回执指令单（幂等重发——同一单重复领到由 governor 去重，不重复执行）
function govClaim(instanceId) {
  if (!instanceId) return { orders: [] }
  const out = []
  try {
    for (const f of readdirSync(GOV_PENDING_DIR).filter((f) => f.endsWith('.json'))) {
      try {
        const p = join(GOV_PENDING_DIR, f)
        const box = JSON.parse(readFileSync(p, 'utf8'))
        if (box.order.instanceId !== instanceId) continue
        if (!box.claimedAt) { box.claimedAt = new Date().toISOString(); writeFileSync(p, JSON.stringify(box, null, 2)) }
        out.push(box)
      } catch { /* 单文件损坏不阻断其余 */ }
    }
  } catch { /* 目录未建 = 无单 */ }
  return { orders: out }
}

function govReceipt({ orderId, ok, refusal, out, error }) {
  const p = join(GOV_PENDING_DIR, `${orderId}.json`)
  if (!existsSync(p)) throw new Error('指令单不存在或已回执')
  const box = JSON.parse(readFileSync(p, 'utf8'))
  mkdirSync(GOV_DONE_DIR, { recursive: true })
  writeFileSync(join(GOV_DONE_DIR, `${orderId}.json`), JSON.stringify({ ...box, receipt: { ok: Boolean(ok), refusal: refusal || '', out: String(out || '').slice(-800), error: String(error || '').slice(-300), at: new Date().toISOString() } }, null, 2))
  unlinkSync(p)
  // 全量回执留痕；伪造签名拒绝 = critical（最高危面被探测的信号）
  const sev = ok ? 'info' : (refusal === 'signature' ? 'critical' : 'warning')
  appendEvent({ domain: 'governance', type: 'governance.receipt', severity: sev, subject: orderId, payload: { instanceId: box.order.instanceId, action: box.order.action, ok: Boolean(ok), refusal: refusal || '', summary: govSummary(box.order.action, box.order.args), out: String(out || error || '').slice(-200) } })
  return { ok: true }
}

function govSnapshot() {
  const brief = (dir, n) => {
    try {
      return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().slice(-n).map((f) => {
        try {
          const b = JSON.parse(readFileSync(join(dir, f), 'utf8'))
          return { id: b.order.id, instanceId: b.order.instanceId, action: b.order.action, summary: govSummary(b.order.action, b.order.args), by: b.order.args.by, createdAt: b.order.createdAt, claimedAt: b.claimedAt || '', state: b.receipt ? (b.receipt.ok ? '已完成' : `被拒${b.receipt.refusal ? '：' + b.receipt.refusal : ''}`) : '待执行', severity: b.receipt && !b.receipt.ok && b.receipt.refusal === 'signature' ? 'critical' : '' }
        } catch { return null }
      }).filter(Boolean)
    } catch { return [] }
  }
  return { pending: brief(GOV_PENDING_DIR, 50), done: brief(GOV_DONE_DIR, 20), signKeyConfigured: Boolean(process.env.GOV_SIGN_KEY) }
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
  const p = configPath('data-roots.yml')
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
  const p = configPath('alert-rules.yml')
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
      // 大脑仓镜像（C2）：未启用=disabled；启用后按同步状态如实呈现
      brain: !BRAIN_URL ? 'disabled' : (() => { const st = brainStatus(); return st.lastError && !st.head ? `error: ${st.lastError}` : (st.lastOkAt ? 'ok' : 'pending') })(),
      // 协作转写（Model B 多宿主数据面）：映射非空即启用，周期读 Hub 镜像
      yuyiTranscribe: !yuyiStatus.enabled ? 'disabled' : (yuyiStatus.lastError ? `error: ${yuyiStatus.lastError}` : (yuyiStatus.lastRunAt ? 'ok' : 'pending')),
    },
    brain: brainStatus(),
    yuyiTranscribe: { ...yuyiStatus },
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

// ---- HTTP 上报端点（二期：契约校验 + append 到 obs/events/http/；受保护模式下注记平台验证的上报者身份）----
function httpIngest(body, verifiedAs) {
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
    else valid.push({ ...ev, ...(verifiedAs ? { verifiedAs } : {}) })
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  try {
    // 看板外壳 openly 提供（无数据）；所有数据/写入端点按模式鉴权
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'public', 'index.html')))
      return
    }
    // 数据读取与治理：受保护模式要求管理员令牌；例外=上报与 governor 领单/回执（自有御符 token 认证）
    const governorAgentPath = (url.pathname === '/api/govern/orders' && req.method === 'GET') || (url.pathname === '/api/govern/receipt' && req.method === 'POST')
    if (SECURED && !(url.pathname === '/api/events' && req.method === 'POST') && !governorAgentPath && !adminOk(req)) {
      return sendJson(res, 401, { error: '需要管理员令牌（x-obs-admin 头）' })
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
      req.on('end', async () => {
        try {
          // 上报者认证：受保护/强制模式下，凭御符 token 验证「谁在上报」，验证通过才落盘
          let verifiedAs = ''
          if (SECURED || REQUIRE_TOKEN) {
            const v = await verifyReporter(req.headers.authorization)
            if (!v.ok) { sendJson(res, 401, { error: `上报被拒绝：${v.why}` }); return }
            verifiedAs = v.agentId
          }
          const parsed = JSON.parse(body || '{}')
          const events = Array.isArray(parsed) ? parsed : parsed.events ?? [parsed]
          sendJson(res, 200, httpIngest(events, verifiedAs))
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
    if (req.method === 'POST' && url.pathname === '/api/govern/dispatch') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 16384) req.destroy() })
      req.on('end', () => {
        try {
          const { instanceId, action, by, confirmReal, taskId, root, sub, file, to, from } = JSON.parse(body || '{}')
          sendJson(res, 200, govDispatch({ instanceId, action, by, args: { taskId, root, sub, file, to, from, confirmReal } }))
        } catch (e) { sendJson(res, 400, { ok: false, error: e.message }) }
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/govern/orders') {
      // governor 领单：御符 token 认证（与上报同语义，验「谁在领单」）；平台管理员不经此端点
      // （注意：GET 无请求体，不能等 req 'end'——外层回调为 async，此处直接 await）
      if (SECURED || REQUIRE_TOKEN) {
        const v = await verifyReporter(req.headers.authorization)
        if (!v.ok) return sendJson(res, 401, { error: `领单被拒绝：${v.why}` })
      }
      return sendJson(res, 200, govClaim(url.searchParams.get('instanceId') || ''))
    }
    if (req.method === 'POST' && url.pathname === '/api/govern/receipt') {
      let body = ''
      req.on('data', (c) => { body += c; if (body.length > 65536) req.destroy() })
      req.on('end', async () => {
        try {
          if (SECURED || REQUIRE_TOKEN) {
            const v = await verifyReporter(req.headers.authorization)
            if (!v.ok) { sendJson(res, 401, { error: `回执被拒绝：${v.why}` }); return }
          }
          const { orderId, ok, refusal, out, error } = JSON.parse(body || '{}')
          if (!orderId) throw new Error('缺 orderId')
          sendJson(res, 200, govReceipt({ orderId, ok, refusal, out, error }))
        } catch (e) { sendJson(res, String(e.message).includes('不存在') ? 404 : 400, { ok: false, error: e.message }) }
      })
      return
    }
    sendJson(res, 404, { error: 'not found' })
  } catch (e) { sendJson(res, 500, { error: e.message }) }
})

// ---- Model B 多宿主数据面：Hub 镜像协作转写（内建循环，映射=治理地址簿 agentId 字段）----
// Hub 在云（hub.qianji.io）；本机 ~/.yuyi/hub/inbox.db 是宿主 yuyi 守护进程同步的**本地镜像**——
// 与平台同机，故平台内建循环逐映射实例转写（纯客户端如 omp 容器本地无镜像，不自行转写）。
// 映射非空自动启用；--no-yuyi-transcribe 显式关闭；状态见 /api/health 与快照 yuyiTranscribe。
const YUYI_MAPPED = DATA_ROOTS.list.filter((r) => r.agentId).map((r) => ({ instanceId: r.instanceId, agentId: r.agentId, hostType: r.hostType || 'omp', system: r.system || r.instanceId }))
const yuyiStatus = { mapped: YUYI_MAPPED.length, enabled: false, lastRunAt: '', lastError: '', totalEmitted: 0 }
const yuyiTranscribers = (!YUYI_TRANSCRIBE_OFF && YUYI_MAPPED.length > 0) ? YUYI_MAPPED.map((m) => createTranscriber({
  instance: m.instanceId,
  self: m.agentId,
  yuyiDir: process.env.YUYI_STATE_DIR || join(homedir(), '.yuyi'),
  hostType: m.hostType,
  system: m.system,
  stateFile: join(OBS, `.yuyi-transcribe-${m.instanceId}.json`),
  sink: async (events) => { for (const e of events) appendEvent(e) },
  log: (s) => console.log(`[yuyi-transcribe ${m.instanceId}] ${new Date().toISOString()} ${s}`),
})) : []
if (yuyiTranscribers.length > 0) yuyiStatus.enabled = true
async function yuyiTick() {
  for (const t of yuyiTranscribers) {
    try { yuyiStatus.totalEmitted += await t.tick() } catch (e) { yuyiStatus.lastError = e.message }
  }
  yuyiStatus.lastRunAt = new Date().toISOString()
}

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
// ---- Model B / C2 大脑仓镜像：启动即同步，之后按 --brain-sync-sec 周期同步（进程内建，无独立进程）----
// 事件只在状态跃迁时发一次（不随周期刷屏）；conflict=critical（知识升级已被拒写，呈报主人裁决）
let brainLastOk = null
function brainTick() {
  try {
    ensureBrainMirror({ url: BRAIN_URL, dir: BRAIN_DIR })
    const st = syncBrainMirror({ dir: BRAIN_DIR })
    const bad = st.conflict || st.lastError
    if (!bad && brainLastOk === false) appendEvent({ domain: 'platform', type: 'platform.brain.sync', severity: 'info', subject: BRAIN_URL, payload: { recovered: true, head: st.head, behind: st.behind } })
    if (!bad) { brainLastOk = true; return }
    if (brainLastOk !== false) appendEvent({ domain: 'platform', type: 'platform.brain.sync', severity: st.conflict ? 'critical' : 'warning', subject: BRAIN_URL, payload: { conflict: st.conflict, error: st.lastError, behind: st.behind } })
    brainLastOk = false
  } catch (e) {
    if (brainLastOk !== false) appendEvent({ domain: 'platform', type: 'platform.brain.sync', severity: 'warning', subject: BRAIN_URL, payload: { error: e.message } })
    brainLastOk = false
  }
}

server.listen(PORT, HOST, () => {
  const mode = SECURED ? (REQUIRE_TOKEN || !isLoopbackHost(HOST) ? `受保护（上报=御符token 验证${AUTH_YUFU_URL ? ' @ ' + AUTH_YUFU_URL : '未配置!'}，管理=${ADMIN_TOKEN ? '令牌已设' : '未设'}）` : 'token 强制') : '本机信任（127.0.0.1，未鉴权）'
  console.log(`[observatory] 看板 http://${HOST}:${PORT}  数据根 ${OBS}  认证模式：${mode}${BRAIN_URL ? `  大脑仓镜像 ${BRAIN_DIR}` : ''}${yuyiStatus.enabled ? `  协作转写 ${yuyiStatus.mapped} 实例` : ''}`)
  appendEvent({ domain: 'platform', type: 'platform.started', severity: 'info', subject: `observatory@${PORT}` })
  if (BRAIN_URL) {
    brainTick()
    setInterval(brainTick, Math.max(30, BRAIN_SYNC_SEC) * 1000)
  }
  if (yuyiStatus.enabled) {
    yuyiTick()
    setInterval(yuyiTick, 15_000)
  } else if (!YUYI_TRANSCRIBE_OFF) {
    console.log('[observatory] 协作转写未启用：治理地址簿无 agentId 映射（data-roots.yml 加 agentId 即自动启用）')
  }
})
