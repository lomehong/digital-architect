#!/usr/bin/env node
/**
 * yuyi-transcribe.mjs — 御驿协作消息实例侧转写（Model B 多宿主数据面，2026-09-12 实施）。
 *
 * 职责：把本机 `~/.yuyi` **Hub 镜像**（宿主 yuyi 守护进程同步的收件箱/投递/闸门事实）转写为
 * observatory 事件（契约 §7.2.1），经文件约定或认证 HTTP 上报。
 * **拓扑事实（2026-09-13 实测更正）**：Hub 在云（如 hub.qianji.io）；`hub/inbox.db` 是 **Hub 同机侧**
 * 守护进程同步的本地镜像——纯客户端（如 omp 容器）本地没有它，容器内不启动本工具；
 * 镜像同机侧（平台宿主）按「实例 ↔ agentId」映射逐实例转写（平台 `--yuyi-transcribe` 内建循环，
 * 映射来自治理地址簿 data-roots.yml 的 agentId 字段）。
 *
 * **实例只转写，不判定、不补全身份**：
 *   · peerAgentId/peerOwner/peerRole 只取 Hub 权威回填字段（payload.from / recipients 目录 / 索引表），
 *     absent 就是 absent——绝不从 name/device 推测（老 Hub → 「未验证」诚实降级）；
 *   · **消息正文 text 永不进入事件**（与 yuyi-ingest 同一隐私纪律）；
 *   · 对 ~/.yuyi 只读（sqlite readOnly；events.jsonl 只读）。
 *
 * 数据源（全部可选，缺席=显式跳过）：
 *   hub/inbox.db · messages          → collab.message.received（按 recipients 把 recipient_id 归属到
 *                                      agentId，仅转写映射实例自己的收件——镜像可能含多方事实）
 *   hub/inbox.db · delivered_index   → collab.message.received|sent（按 self 判方向；只取与 self 相关行）
 *   hub/inbox.db · message_events    → collab.message.delivery-failed（status=failed，warning）
 *   hub/inbox.db · would_deny_events → collab.gate-denied（action 命中契约枚举才转写，其余跳过计数）
 *   yuyi-agent/events.jsonl          → collab.gate-denied（kind=terminated|blocked；released 非拒绝不转写）
 *
 * 自身份：--self <agentId> 显式指定（平台映射转写用）；缺省回退 agent.json（单身份机或唯一身份）。
 * 幂等：检查点（各源 rowid/seq + jsonl lastSeq）——重启不重复；messages 为瞬时收件箱，尽力而为不补历史。
 *
 * CLI 用法：
 *   node yuyi-transcribe.mjs --instance <实例id> [--obs <数据根>|--http <平台url>]
 *        [--yuyi <~/.yuyi>] [--self <agentId>] [--state <文件>] [--interval-sec 10] [--once]
 * 嵌入用法（平台内建循环）：import { createTranscriber, makeSink } from './yuyi-transcribe.mjs'
 * 认证：--http 时读环境变量 YUFU_CREDENTIAL 作为 Bearer token（受保护模式必需）。
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const GATE_DECISIONS = new Set(['terminated', 'blocked', 'target_terminated', 'target_blocked', 'rate_limited', 'unavailable'])
const parseJson = (s, d = null) => { try { return JSON.parse(s) } catch { return d } }
const iso = (ms) => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : '' }
const dirnameOf = (p) => p.replace(/[\\/][^\\/]*$/, '') || '.'
const argOf = (name, def = '') => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : def }

/** 创建一个转写器（CLI 与平台内建循环共用核心） */
export function createTranscriber(opts) {
  const {
    instance, self = '', yuyiDir, sink, stateFile,
    hostType = 'omp', system = 'ops-pi', log = () => {},
  } = opts
  const YUYI = resolve(yuyiDir)
  const cp = { messages: 0, message_events: 0, delivered_index: 0, would_deny_events: 0, jsonlSeq: 0, skippedGate: 0 }
  try { Object.assign(cp, parseJson(readFileSync(stateFile, 'utf8'), {})) } catch { /* 首次无状态 */ }
  const saveCp = () => { try { mkdirSync(dirnameOf(stateFile), { recursive: true }); writeFileSync(stateFile, JSON.stringify(cp)) } catch (e) { log(`检查点写入失败：${e.message}`) } }

  const envelope = (ev) => ({ ts: new Date().toISOString(), instanceId: instance, hostType, system, ...ev })
  function selfAgentId() {
    if (self) return self
    const p = join(YUYI, 'agent.json')
    if (!existsSync(p)) return ''
    const cfg = parseJson(readFileSync(p, 'utf8'), null)
    const agents = cfg?.agents && typeof cfg.agents === 'object' ? cfg.agents : {}
    if (cfg?.default && agents[cfg.default]?.agent_id) return agents[cfg.default].agent_id
    const only = Object.values(agents).map((v) => v?.agent_id).filter(Boolean)
    return only.length === 1 ? only[0] : ''
  }
  function openHub() {
    const p = join(YUYI, 'hub', 'inbox.db')
    if (!existsSync(p)) return null
    try { return new DatabaseSync(p, { readOnly: true }) } catch (e) { log(`hub/inbox.db 打开失败（跳过本轮）：${e.message}`); return null }
  }
  // recipients 是 Hub 权威目录：只取 agentId/owner_username/device/name（peerRole 无权威列，不编造）
  function recipientInfo(db, agentId) {
    try {
      const r = db.prepare('select agent_id, device, name, owner_username from recipients where agent_id = ? limit 1').get(agentId)
      if (!r) return null
      const out = { peerDevice: r.device || '', peerName: r.name || '' }
      if (r.agent_id) { out.peerAgentId = r.agent_id; if (r.owner_username) out.peerOwner = r.owner_username }
      return out
    } catch { return null }
  }
  function recipientAgentId(db, recipientId) {
    try { return db.prepare('select agent_id from recipients where recipient_id = ? limit 1').get(recipientId)?.agent_id || '' } catch { return '' }
  }
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

  function transcribeMessages(db, selfId) {
    const rows = db.prepare('select seq, id, recipient_id, byte_size, received_at, payload from messages where seq > ? order by seq limit ?').all(cp.messages, 500)
    const evs = []
    for (const r of rows) {
      cp.messages = Math.max(cp.messages, r.seq) // 检查点按读到的位置推进（无论是否归属本实例）
      const toAgent = recipientAgentId(db, r.recipient_id)
      if (selfId && toAgent && toAgent !== selfId) continue // 镜像可能含多方收件：非本实例的不搬
      const j = parseJson(r.payload, {}) || {}
      evs.push(envelope({
        domain: 'collab', type: 'collab.message.received', severity: 'info', direction: 'inbound',
        subject: r.id || `seq:${r.seq}`, mode: typeof j.mode === 'string' ? j.mode : 'notify',
        byteSize: r.byte_size, receivedAt: iso(r.received_at), taskId: typeof j.taskId === 'string' ? j.taskId : undefined,
        replyTo: typeof j.replyTo === 'string' ? j.replyTo : undefined,
        ...peerFromPayload(j.from),
      }))
    }
    return evs
  }

  function transcribeDeliveredIndex(db, selfId) {
    if (!selfId) return [] // 自身份未知：不猜方向，整源跳过
    const rows = db.prepare('select rowid as rid, msg_id, recipient_agent_id, sender_agent_id, task_id, at from delivered_index where rowid > ? order by rowid limit ?').all(cp.delivered_index, 500)
    const evs = []
    for (const r of rows) {
      cp.delivered_index = Math.max(cp.delivered_index, r.rid)
      const inbound = r.recipient_agent_id === selfId, outbound = r.sender_agent_id === selfId
      if (!inbound && !outbound) continue // 与自身无关的投递不搬
      const peerId = inbound ? r.sender_agent_id : r.recipient_agent_id
      // peerAgentId 本身就是 Hub 投递索引的权威字段——目录查不到也保留 agentId，只缺 owner/device/name
      const info = peerId ? recipientInfo(db, peerId) : null
      evs.push(envelope({
        domain: 'collab', type: inbound ? 'collab.message.received' : 'collab.message.sent', severity: 'info',
        direction: inbound ? 'inbound' : 'outbound', subject: r.msg_id, taskId: r.task_id || undefined,
        deliveredAt: iso(r.at),
        ...(peerId
          ? { peerAgentId: peerId, ...(info?.peerOwner ? { peerOwner: info.peerOwner } : {}), ...(info?.peerDevice ? { peerDevice: info.peerDevice } : {}), ...(info?.peerName ? { peerName: info.peerName } : {}) }
          : { peerName: '未知' }),
      }))
    }
    return evs
  }

  function transcribeDeliveryFailures(db) {
    const rows = db.prepare("select rowid as rid, msg_id, event, from_device, to_device, mode, status, detail, ts from message_events where rowid > ? and (status = 'failed' or event = 'fail') order by rowid limit ?").all(cp.message_events, 500)
    const evs = rows.map((r) => envelope({
      domain: 'collab', type: 'collab.message.delivery-failed', severity: 'warning', direction: 'inbound',
      subject: r.msg_id || `seq:${r.rid}`, mode: r.mode || '', deliveryStatus: r.status || r.event || 'failed',
      detail: String(r.detail || '').slice(0, 200), at: iso(r.ts), fromDevice: r.from_device || '', toDevice: r.to_device || '',
    }))
    const last = db.prepare('select rowid as rid from message_events order by rowid desc limit 1').get()
    if (last) cp.message_events = Math.max(cp.message_events, last.rid) // 检查点=读到哪（失败与非失败一并推进）
    return evs
  }

  function transcribeWouldDeny(db, selfId) {
    const rows = db.prepare('select rowid as rid, msg_id, sender_agent, sender_owner, target, action, mode, reason, ts from would_deny_events where rowid > ? order by rowid limit ?').all(cp.would_deny_events, 500)
    const evs = []
    for (const r of rows) {
      cp.would_deny_events = Math.max(cp.would_deny_events, r.rid)
      if (selfId && r.sender_agent !== selfId && r.target !== selfId && r.target !== 'outbound-reply') continue // 与自身无关的拒绝不搬
      const decision = GATE_DECISIONS.has(r.action) ? r.action : (GATE_DECISIONS.has(r.classification) ? r.classification : '')
      if (!decision) { cp.skippedGate = (cp.skippedGate || 0) + 1; continue } // 词表外：跳过计数，不编造
      evs.push(envelope({
        domain: 'collab', type: 'collab.gate-denied', severity: 'warning', direction: 'inbound',
        subject: r.msg_id || r.target || `seq:${r.rid}`, decision, reason: String(r.reason || '（无理由记录）').slice(0, 200),
        mode: r.mode || '', at: iso(r.ts),
        ...(r.sender_agent ? { peerAgentId: r.sender_agent, ...(r.sender_owner ? { peerOwner: r.sender_owner } : {}) } : {}),
      }))
    }
    return evs
  }

  function transcribeGateJsonl() {
    const p = join(YUYI, 'yuyi-agent', 'events.jsonl')
    if (!existsSync(p)) return []
    const out = []
    for (const l of readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)) {
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

  return {
    /** 单轮转写：返回本轮事件数；检查点只在上报成功后推进 */
    async tick() {
      const selfId = selfAgentId()
      const db = openHub()
      const batches = []
      if (db) {
        try { batches.push(transcribeMessages(db, selfId)) } catch (e) { log(`messages 转写失败：${e.message}`) }
        try { batches.push(transcribeDeliveredIndex(db, selfId)) } catch (e) { log(`delivered_index 转写失败：${e.message}`) }
        try { batches.push(transcribeDeliveryFailures(db)) } catch (e) { log(`message_events 转写失败：${e.message}`) }
        try { batches.push(transcribeWouldDeny(db, selfId)) } catch (e) { log(`would_deny_events 转写失败：${e.message}`) }
        try { db.close() } catch { /* 已关闭 */ }
      } else {
        log(`未找到 ${join(YUYI, 'hub', 'inbox.db')}——本目录无 Hub 收件箱镜像（该机为纯客户端或未运行 Hub 同步）：协作事实由 Hub 镜像同机侧转写`)
      }
      try { batches.push(transcribeGateJsonl()) } catch (e) { log(`events.jsonl 转写失败：${e.message}`) }
      const evs = batches.flat()
      if (evs.length) {
        await sink(evs)
        saveCp()
        log(`转写上报 ${evs.length} 条事件`)
      } else {
        saveCp()
      }
      return evs.length
    },
  }
}

/** sink 工厂：文件约定（obs）与/或认证 HTTP（POST /api/events，Bearer YUFU_CREDENTIAL） */
export function makeSink({ obs, httpBase, instance, log = () => {} }) {
  let fileSink = null
  if (obs) {
    const dir = join(obs, 'events', instance)
    mkdirSync(dir, { recursive: true })
    fileSink = (events) => appendFileSync(join(dir, new Date().toISOString().slice(0, 10) + '.ndjson'), events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  }
  return async (events) => {
    if (fileSink) fileSink(events)
    if (httpBase) {
      const res = await fetch(`${httpBase}/api/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.YUFU_CREDENTIAL || ''}` },
        body: JSON.stringify({ events }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status === 401) log('上报被拒（401）：检查 YUFU_CREDENTIAL')
    }
  }
}

// ---- CLI（直接运行时；被 import 时不执行）----
const SELF_PATH = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === SELF_PATH) {
  const INSTANCE = argOf('--instance')
  const HTTP_BASE = (argOf('--http') || '').replace(/\/$/, '')
  const OBS_ARG = argOf('--obs', '')
  const OBS = OBS_ARG ? resolve(OBS_ARG) : ''
  if (!INSTANCE) { console.error('[yuyi-transcribe] 缺 --instance <实例id>'); process.exit(2) }
  if (!HTTP_BASE && !OBS) { console.error('[yuyi-transcribe] 缺上报目标：--obs <数据根>（文件约定）或 --http <平台url>'); process.exit(2) }
  const log = (s) => console.log(`[yuyi-transcribe ${INSTANCE}] ${new Date().toISOString()} ${s}`)
  const YUYI = argOf('--yuyi', process.env.YUYI_STATE_DIR || join(homedir(), '.yuyi'))
  const STATE_ARG = argOf('--state', '')
  const t = createTranscriber({
    instance: INSTANCE,
    self: argOf('--self'),
    yuyiDir: YUYI,
    sink: makeSink({ obs: OBS, httpBase: HTTP_BASE, instance: INSTANCE, log }),
    stateFile: STATE_ARG ? resolve(STATE_ARG) : join(OBS || YUYI, `.yuyi-transcribe-${INSTANCE}.json`),
    hostType: argOf('--host-type', 'omp'),
    system: argOf('--system', 'ops-pi'),
    log,
  })
  if (process.argv.includes('--once')) {
    t.tick().then((n) => { log(`once 完成：${n} 条`); process.exit(0) }).catch((e) => { log(`失败：${e.message}`); process.exit(1) })
  } else {
    const sec = Math.max(3, Number(argOf('--interval-sec', '10')))
    log(`启动：yuyi=${YUYI}  目标=${HTTP_BASE || OBS}  间隔=${sec}s`)
    const loop = () => t.tick().catch((e) => log(`tick 失败：${e.message}`))
    loop()
    setInterval(loop, sec * 1000)
  }
}
