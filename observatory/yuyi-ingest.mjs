#!/usr/bin/env node
/**
 * yuyi-ingest.mjs — 御驿协作面只读摄取（零依赖；与 omp agent.db 只读摄取同哲学）。
 *
 * 数据源（默认 `~/.yuyi`，可用 YUYI_STATE_DIR 覆盖）：
 *   hub/inbox.db            Hub 收件箱：recipients（对端身份）/ messages（消息元数据）/ message_events（投递结果）
 *   yuyi-agent/state.json   agent-daemon 闸门状态：agents[].termination / block（evaluateGate 的数据源）
 *   yuyi-agent/events.jsonl 治理执行事件（terminated / released 等）
 *   agent.json              本机御符实例身份（agent_id / yufu_url）
 *
 * **边界纪律（不可放宽）**：
 *   1. **只读**——`readOnly: true` 打开，绝不写任何文件/库；
 *   2. **不摄取消息正文**——`payload.text` 不进观测面，只取白名单元数据（谁→谁/模式/字节/时间）；
 *   3. **不读凭据**——`agent.json` 的 token 字段显式跳过；
 *   4. **不接管身份**——平台不做身份验证、不判定权限（§7.2.1），仅呈现事实。
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'

const iso = (ms) => { const n = Number(ms); return Number.isFinite(n) && n > 0 ? new Date(n).toISOString() : '' }

/** 只从消息 payload 提取白名单字段；**正文 text 一律丢弃** */
function pluckMeta(payload) {
  try {
    const j = JSON.parse(payload)
    return {
      mode: typeof j.mode === 'string' ? j.mode : '',
      fromDevice: j.from?.device ?? '',
      fromSession: j.from?.sessionID ?? '',
      toTarget: typeof j.to?.target === 'string' ? j.to.target : (typeof j.to === 'string' ? j.to : ''),
      // 身份字段：Hub 权威回填时才有（老 Hub 不回填 → 缺席，不推测）
      peerAgentId: j.from?.agentId ?? '',
      peerOwner: j.from?.ownerUsername ?? '',
      peerRole: j.from?.role ?? '',
    }
  } catch { return { mode: '', fromDevice: '', fromSession: '', toTarget: '', peerAgentId: '', peerOwner: '', peerRole: '' } }
}

function parseJson(s, d = null) { try { return JSON.parse(s) } catch { return d } }

export function readYuyiFace() {
  const dir = process.env.YUYI_STATE_DIR || join(homedir(), '.yuyi')
  const out = {
    available: false, stateDir: dir, reason: '',
    recipients: [], messages: [],
    delivery: { total: 0, byStatus: {}, failures: [] },
    gate: { agents: [], terminated: 0, blocked: 0, events: [] },
    identity: { agents: [], defaultAgent: '' },
  }

  const dbPath = join(dir, 'hub', 'inbox.db')
  if (existsSync(dbPath)) {
    let db = null
    try {
      db = new DatabaseSync(dbPath, { readOnly: true })
      out.recipients = db.prepare('select recipient_id, agent_id, device, name, agent_kind, capabilities, first_seen, last_seen from recipients order by last_seen desc limit 200').all()
        .map((r) => ({
          recipientId: r.recipient_id, agentId: r.agent_id, device: r.device || '', name: r.name || '',
          agentKind: r.agent_kind || '', wake: (parseJson(r.capabilities, {}) || {}).wake || '',
          firstSeen: iso(r.first_seen), lastSeen: iso(r.last_seen),
        }))
      out.messages = db.prepare('select seq, id, recipient_id, byte_size, received_at, fetched_at, payload from messages order by seq desc limit 200').all()
        .map((r) => {
          const m = pluckMeta(r.payload)
          return {
            seq: r.seq, id: r.id, recipientId: r.recipient_id, byteSize: r.byte_size,
            receivedAt: iso(r.received_at), fetched: r.fetched_at !== null,
            mode: m.mode, fromDevice: m.fromDevice, fromSession: m.fromSession, toTarget: m.toTarget,
            peerAgentId: m.peerAgentId, peerOwner: m.peerOwner, peerRole: m.peerRole,
          }
        })
      const evs = db.prepare('select seq, msg_id, event, mode, status, detail, ts from message_events order by seq desc limit 200').all()
      out.delivery.total = evs.length
      for (const e of evs) out.delivery.byStatus[e.status || e.event || 'unknown'] = (out.delivery.byStatus[e.status || e.event || 'unknown'] || 0) + 1
      out.delivery.failures = evs.filter((e) => e.status === 'failed' || e.event === 'fail')
        .map((e) => ({ msgId: e.msg_id, detail: e.detail || '', at: iso(e.ts) }))
      out.available = true
    } catch (e) {
      out.reason = `hub/inbox.db 读取失败：${e.message}`
    } finally { try { db?.close() } catch { /* 已关闭 */ } }
  } else {
    out.reason = '未找到 hub/inbox.db（该机未接入御驿 Hub）'
  }

  // 闸门状态（终止/屏蔽）+ 治理执行事件
  const statePath = join(dir, 'yuyi-agent', 'state.json')
  if (existsSync(statePath)) {
    const st = parseJson(readFileSync(statePath, 'utf8'), null)
    const agents = Array.isArray(st?.agents) ? st.agents : []
    out.gate.agents = agents.map((a) => ({
      agentId: a.agentId || '', name: a.name || '', owner: a.ownerUsername || '', role: a.role || '',
      terminated: Boolean(a.termination), blocked: Boolean(a.block),
      termination: a.termination ? { by: a.termination.by || '', reason: a.termination.reason || '', scope: a.termination.scope || '' } : null,
      block: a.block ? { by: a.block.by || '', reason: a.block.reason || '', until: a.block.until ? iso(a.block.until) : '' } : null,
      updatedAt: iso(a.updatedAt),
    }))
    out.gate.terminated = out.gate.agents.filter((a) => a.terminated).length
    out.gate.blocked = out.gate.agents.filter((a) => a.blocked).length
  }
  const evPath = join(dir, 'yuyi-agent', 'events.jsonl')
  if (existsSync(evPath)) {
    out.gate.events = readFileSync(evPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-100).map((l) => {
      const j = parseJson(l, null)
      if (!j?.event) return null
      return { seq: j.seq, at: iso(j.at), kind: j.event.kind || '', targetAgentId: j.event.target?.agentId || '', targetName: j.event.target?.name || '', by: j.event.by || '', reason: j.event.reason || '' }
    }).filter(Boolean)
  }

  // 本机御符实例身份（**token 显式跳过**）
  const agentPath = join(dir, 'agent.json')
  if (existsSync(agentPath)) {
    const cfg = parseJson(readFileSync(agentPath, 'utf8'), null)
    if (cfg?.agents && typeof cfg.agents === 'object') {
      out.identity.agents = Object.entries(cfg.agents).map(([key, v]) => ({
        key, agentId: v?.agent_id || '', yufuUrl: v?.yufu_url || '', hub: cfg.hub || '', isDefault: cfg.default === key,
      }))
      out.identity.defaultAgent = cfg.default || ''
    }
  }
  return out
}
