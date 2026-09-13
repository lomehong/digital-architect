#!/usr/bin/env node
/**
 * yuyi-transcribe.mjs — 御驿协作消息实例侧转写（Model B 多宿主数据面，2026-09-12 实施）。
 *
 * 职责：把本机 `~/.yuyi` 状态目录中的协作事实转写为 observatory 事件（契约 §7.2.1），
 * 经文件约定（obs/events/<实例>/<日期>.ndjson）或认证 HTTP（POST /api/events）上报。
 * **实例只转写，不判定、不补全身份**：
 *   · peerAgentId/peerOwner/peerRole 只取 Hub 权威回填字段（payload.from / recipients 目录），
 *     absent 就是 absent——绝不从 name/device 推测（老 Hub → 「未验证」诚实降级）；
 *   · **消息正文 text 永不进入事件**（与 yuyi-ingest 同一隐私纪律）；
 *   · 对 ~/.yuyi 只读（sqlite readOnly；events.jsonl 只读）。
 *
 * 数据源（全部可选，缺席=显式跳过并计数，与 yuyi-ingest 同哲学）：
 *   hub/inbox.db · messages          → collab.message.received（direction=inbound，Hub 收件视图）
 *   hub/inbox.db · delivered_index   → collab.message.sent|received（按 agent.json 自身份判方向；
 *                                      仅转写与本实例相关的行——Hub 库是全局的，不搬别人的事实）
 *   hub/inbox.db · message_events    → collab.message.delivery-failed（status=failed，warning）
 *   hub/inbox.db · would_deny_events → collab.gate-denied（action 命中契约枚举才转写，其余跳过计数）
 *   yuyi-agent/events.jsonl          → collab.gate-denied（kind=terminated|blocked；released 非拒绝不转写）
 *
 * 幂等：--state 检查点（各源 rowid/seq + jsonl lastSeq），重启不重复转写；
 *       messages 表为瞬时收件箱（取走即删），检查点按 seq 尽力而为——观测是尽力而为的呈现，不补历史。
 *
 * 用法：
 *   node yuyi-transcribe.mjs --instance <实例id> [--obs <数据根>|--http <平台url>]
 *        [--yuyi <~/.yuyi>] [--state <文件>] [--interval-sec 10] [--once]
 *        [--host-type omp] [--system <系统>]
 * 认证：--http 时读环境变量 YUFU_CREDENTIAL 作为 Bearer token（受保护模式必需）。
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const ARGV = process.argv
const argOf = (n, d = '') => { const i = ARGV.indexOf(n); return i > 0 ? ARGV[i + 1] : d }
const INSTANCE = argOf('--instance')
const HOST_TYPE = argOf('--host-type', 'omp')
const SYSTEM = argOf('--system', 'ops-pi')
const YUYI = resolve(argOf('--yuyi', process.env.YUYI_STATE_DIR || join(homedir(), '.yuyi')))
const ONCE = ARGV.includes('--once')
const INTERVAL_SEC = Number(argOf('--interval-sec', '10'))
const HTTP_BASE = (argOf('--http') || '').replace(/\/$/, '')
const OBS = resolve(argOf('--obs', ''))
if (!INSTANCE) { console.error('[yuyi-transcribe] 缺 --instance <实例id>'); process.exit(2) }
if (!HTTP_BASE && !OBS) { console.error('[yuyi-transcribe] 缺上报目标：--obs <数据根>（文件约定）或 --http <平台url>'); process.exit(2) }
const STATE_FILE = resolve(argOf('--state', OBS ? join(OBS, `.yuyi-transcribe-${INSTANCE}.json`) : join(YUYI, `.yuyi-transcribe-${INSTANCE}.json`)))
const BATCH = 500
// 契约枚举（contracts/validate.mjs collab.gate-denied 同源）
const GATE_DECISIONS = new Set(['terminated', 'blocked', 'target_terminated', 'target_blocked', 'rate_limited', 'unavailable'])

const log = (s) => console.log(`[yuyi-transcribe ${INSTANCE}] ${new Date().toISOString()} ${s}`)
const iso = (ms) => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : '' }
const parseJson = (s, d = null) => { try { return JSON.parse(s) } catch { return d } }

// ---- 检查点（进程内 + 落盘；各源独立）----
const cp = { messages: 0, message_events: 0, delivered_index: 0, would_deny_events: 0, jsonlSeq: 0, skippedGate: 0 }
try { Object.assign(cp, parseJson(readFileSync(STATE_FILE, 'utf8'), {})) } catch { /* 首次无状态 */ }
const saveCp = () => { try { mkdirSync(dirnameOf(STATE_FILE), { recursive: true }); writeFileSync(STATE_FILE, JSON.stringify(cp)) } catch (e) { log(`检查点写入失败：${e.message}`) } }
function dirnameOf(p) { return p.replace(/[\\/][^\\/]*$/, '') || '.' }

// ---- 上报（文件约定 / 认证 HTTP）----
let fileSink = null
if (OBS) {
  const dir = join(OBS, 'events', INSTANCE)
  mkdirSync(dir, { recursive: true })
  fileSink = (events) => appendFileSync(join(dir, new Date().toISOString().slice(0, 10) + '.ndjson'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n')
}
async function report(events) {
  if (fileSink) fileSink(events)
  if (HTTP_BASE) {
    const res = await fetch(`${HTTP_BASE}/api/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.YUFU_CREDENTIAL || ''}` },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401) log('上报被拒（401）：检查 YUFU_CREDENTIAL')
  }
}
const envelope = (ev) => ({ ts: new Date().toISOString(), instanceId: INSTANCE, hostType: HOST_TYPE, system: SYSTEM, ...ev })

// ---- 身份三元组：整体来自 Hub 回填；agentId 缺席则整体缺席（不得半可信）----
function peerFromPayload(from) {
  const f = from ?? {}
  const out = { peerDevice: typeof f.device === 'string' ? f.device : '', peerName: typeof f.name === 'string' ? f.name : '' }
  if (typeof f.agentId === 'string' && f.agentId !== '') {
    out.peerAgentId = f.agentId
    if (typeof f.ownerUsername === 'string' && f.ownerUsername !== '') out.peerOwner = f.ownerUsername
    if (typeof f.role === 'string' && f.role !== '') out.peerRole = f.role
  }
  return out
}

// ---- 各源转写（返回新事件数组；检查点只在实际写入成功后推进）----
function openHub() {
  const p = join(YUYI, 'hub', 'inbox.db')
  if (!existsSync(p)) return null
  try { return { db: new DatabaseSync(p, { readOnly: true }) } } catch (e) { log(`hub/inbox.db 打开失败（跳过本轮）：${e.message}`); return null }
}
function selfAgentId(hub) {
  const cfg = parseJson(readFileSync(join(YUYI, 'agent.json'), 'utf8'), null)
  const agents = cfg?.agents && typeof cfg.agents === 'object' ? cfg.agents : {}
  const def = cfg?.default && agents[cfg.default]?.agent_id
  if (def) return def
  const only = Object.values(agents).map((v) => v?.agent_id).filter(Boolean)
  return only.length === 1 ? only[0] : ''
}
function recipientInfo(hub, agentId) {
  // recipients 是 Hub 权威目录：只取 agentId/owner_username/device/name（peerRole 无权威列，不编造）
  try {
    const r = hub.db.prepare('select agent_id, device, name, owner_username from recipients where agent_id = ? limit 1').get(agentId)
    if (!r) return null
    const out = { peerDevice: r.device || '', peerName: r.name || '' }
    if (r.agent_id) { out.peerAgentId = r.agent_id; if (r.owner_username) out.peerOwner = r.owner_username }
    return out
  } catch { return null }
}

function transcribeMessages(hub) {
  const rows = hub.db.prepare('select seq, id, byte_size, received_at, payload from messages where seq > ? order by seq limit ?').all(cp.messages, BATCH)
  const evs = rows.map((r) => {
    const j = parseJson(r.payload, {}) || {}
    return envelope({
      domain: 'collab', type: 'collab.message.received', severity: 'info', direction: 'inbound',
      subject: r.id || `seq:${r.seq}`, mode: typeof j.mode === 'string' ? j.mode : 'notify',
      byteSize: r.byte_size, receivedAt: iso(r.received_at), taskId: typeof j.taskId === 'string' ? j.taskId : undefined,
      replyTo: typeof j.replyTo === 'string' ? j.replyTo : undefined,
      ...peerFromPayload(j.from),
    })
  })
  if (rows.length) cp.messages = rows[rows.length - 1].seq
  return evs
}

function transcribeDeliveredIndex(hub, self) {
  if (!self) { cp.skippedSourceDelivered = (cp.skippedSourceDelivered || 0) + 1; return [] } // 自身份未知：不猜方向，整源跳过
  const rows = hub.db.prepare('select rowid as rid, msg_id, recipient_agent_id, sender_agent_id, task_id, at from delivered_index where rowid > ? order by rowid limit ?').all(cp.delivered_index, BATCH)
  const evs = []
  for (const r of rows) {
    const inbound = r.recipient_agent_id === self, outbound = r.sender_agent_id === self
    if (!inbound && !outbound) continue // Hub 全局库：只转写与自身相关的投递
    const peerId = inbound ? r.sender_agent_id : r.recipient_agent_id
    // peerAgentId 本身就是 Hub 投递索引的权威字段——目录查不到也保留 agentId，只缺 owner/device/name
    const info = peerId ? recipientInfo(hub, peerId) : null
    evs.push(envelope({
      domain: 'collab', type: inbound ? 'collab.message.received' : 'collab.message.sent', severity: 'info',
      direction: inbound ? 'inbound' : 'outbound', subject: r.msg_id, taskId: r.task_id || undefined,
      deliveredAt: iso(r.at),
      ...(peerId
        ? { peerAgentId: peerId, ...(info?.peerOwner ? { peerOwner: info.peerOwner } : {}), ...(info?.peerDevice ? { peerDevice: info.peerDevice } : {}), ...(info?.peerName ? { peerName: info.peerName } : {}) }
        : { peerName: '未知' }),
    }))
  }
  if (rows.length) cp.delivered_index = rows[rows.length - 1].rid
  return evs
}

function transcribeDeliveryFailures(hub) {
  const rows = hub.db.prepare("select rowid as rid, msg_id, event, from_device, to_device, mode, status, detail, ts from message_events where rowid > ? and (status = 'failed' or event = 'fail') order by rowid limit ?").all(cp.message_events, BATCH)
  const evs = rows.map((r) => envelope({
    domain: 'collab', type: 'collab.message.delivery-failed', severity: 'warning', direction: 'inbound',
    subject: r.msg_id || `seq:${r.rid}`, mode: r.mode || '', deliveryStatus: r.status || r.event || 'failed',
    detail: String(r.detail || '').slice(0, 200), at: iso(r.ts), fromDevice: r.from_device || '', toDevice: r.to_device || '',
  }))
  const last = hub.db.prepare('select rowid as rid from message_events order by rowid desc limit 1').get()
  if (last) cp.message_events = Math.max(cp.message_events, last.rid) // 失败与非失败都推进检查点（检查点=读到哪，非失败计数）
  return evs
}

function transcribeWouldDeny(hub, self) {
  const rows = hub.db.prepare('select rowid as rid, msg_id, sender_agent, sender_owner, target, action, mode, reason, ts from would_deny_events where rowid > ? order by rowid limit ?').all(cp.would_deny_events, BATCH)
  const evs = []
  for (const r of rows) {
    if (self && r.sender_agent !== self && r.target !== self && r.target !== 'outbound-reply') continue // 与自身无关的拒绝不搬
    const decision = GATE_DECISIONS.has(r.action) ? r.action : (GATE_DECISIONS.has(r.classification) ? r.classification : '')
    if (!decision) { cp.skippedGate = (cp.skippedGate || 0) + 1; continue } // 词表外：跳过计数，不编造
    evs.push(envelope({
      domain: 'collab', type: 'collab.gate-denied', severity: 'warning', direction: 'inbound',
      subject: r.msg_id || r.target || `seq:${r.rid}`, decision, reason: String(r.reason || '（无理由记录）').slice(0, 200),
      mode: r.mode || '', at: iso(r.ts),
      ...(r.sender_agent ? { peerAgentId: r.sender_agent, ...(r.sender_owner ? { peerOwner: r.sender_owner } : {}) } : {}),
    }))
  }
  if (rows.length) cp.would_deny_events = rows[rows.length - 1].rid
  return evs
}

function transcribeGateJsonl() {
  const p = join(YUYI, 'yuyi-agent', 'events.jsonl')
  if (!existsSync(p)) return []
  const out = []
  const lines = readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
  for (const l of lines) {
    const j = parseJson(l, null)
    if (!j || !Number.isFinite(Number(j.seq)) || Number(j.seq) <= cp.jsonlSeq) continue
    cp.jsonlSeq = Math.max(cp.jsonlSeq, Number(j.seq))
    const kind = j.event?.kind || ''
    if (!GATE_DECISIONS.has(kind)) continue // released 等非拒绝动作不转写
    out.push(envelope({
      domain: 'collab', type: 'collab.gate-denied', severity: 'warning', direction: 'inbound',
      subject: j.event.target?.agentId || j.event.target?.name || `seq:${j.seq}`,
      decision: kind, reason: String(j.event.reason || `由 ${j.event.by || '未知'} 执行`).slice(0, 200), at: iso(j.at),
      ...(j.event.target?.agentId ? { peerAgentId: j.event.target.agentId } : {}),
    }))
  }
  return out
}

async function tick() {
  const hub = openHub()
  const batches = []
  if (hub) {
    try { batches.push(transcribeMessages(hub)) } catch (e) { log(`messages 转写失败：${e.message}`) }
    try { batches.push(transcribeDeliveredIndex(hub, selfAgentId(hub))) } catch (e) { log(`delivered_index 转写失败：${e.message}`) }
    try { batches.push(transcribeDeliveryFailures(hub)) } catch (e) { log(`message_events 转写失败：${e.message}`) }
    try { batches.push(transcribeWouldDeny(hub, selfAgentId(hub))) } catch (e) { log(`would_deny_events 转写失败：${e.message}`) }
    try { hub.db.close() } catch { /* 已关闭 */ }
  } else {
    log(`未找到 ${join(YUYI, 'hub', 'inbox.db')}——该机未接入御驿 Hub，协作面显式停用（非故障）`)
  }
  try { batches.push(transcribeGateJsonl()) } catch (e) { log(`events.jsonl 转写失败：${e.message}`) }
  const evs = batches.flat()
  if (evs.length) {
    try { await report(evs); log(`转写上报 ${evs.length} 条事件`); saveCp() } catch (e) { log(`上报失败（检查点不推进，下轮重转）：${e.message}`) }
  } else {
    saveCp()
  }
  return evs.length
}

if (ONCE) {
  tick().then((n) => { log(`once 完成：${n} 条`); process.exit(0) }).catch((e) => { log(`失败：${e.message}`); process.exit(1) })
} else {
  log(`启动：yuyi=${YUYI}  目标=${HTTP_BASE || OBS}  间隔=${Math.max(3, INTERVAL_SEC)}s`)
  const loop = () => tick().catch((e) => log(`tick 失败：${e.message}`))
  loop()
  setInterval(loop, Math.max(3, INTERVAL_SEC) * 1000)
}
