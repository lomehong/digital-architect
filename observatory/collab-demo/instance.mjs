#!/usr/bin/env node
/**
 * collab-demo/instance.mjs — 御驿消息结构化（契约 §7.2.1）的参考实现 / 端到端夹具。
 *
 * 职责边界（重要）：实例**只转写，不判定、不补全身份**。
 *   · peerAgentId  ← YuyiMessage.from.agentId      （Hub 权威回填；客户端无法自报）
 *   · peerOwner    ← YuyiMessage.from.ownerUsername （同上）
 *   · peerRole     ← YuyiMessage.from.role          （avatar/worker/coder/未设置）
 *   老 Hub 不回带这些字段时，**整体缺席**——绝不从 name/device 推测 agentId，
 *   平台据此显示「身份未验证」（诚实降级，见设计文档 §7.2.1）。
 *
 * 本脚本用一个内联假桥（fake bridge）演示四类转写，实际实例把 `readFromYuyi()`
 * 换成真实 Yuyi 桥的 onDeliver/bridge.agentId 即可（Yuyi 侧参考：adapters/pi/yuyi-pi-extension.ts）。
 *
 * 用法：node collab-demo/instance.mjs [OBS_ROOT]
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

// 找 obs 根（含 obs/instances 的目录的父目录）
function findObs(start) {
  let p = start
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(p, 'obs', 'instances'))) return join(p, 'obs')
    if (existsSync(join(p, 'instances'))) return p
    const up = dirname(p)
    if (up === p) return null
    p = up
  }
  return null
}
const OBS = process.argv[2] || findObs(process.cwd())
if (!OBS) { console.error('[collab-demo] 找不到 obs/ 根'); process.exit(1) }

const INST_ID = 'collab-demo-01'
mkdirSync(join(OBS, 'events', INST_ID), { recursive: true })

function emit(ev) {
  appendFileSync(
    join(OBS, 'events', INST_ID, new Date().toISOString().slice(0, 10) + '.ndjson'),
    JSON.stringify({ ts: new Date().toISOString(), instanceId: INST_ID, hostType: 'omp', system: 'demo-collab', ...ev }) + '\n'
  )
}

/** 转写规则：只搬 Hub 回填字段；没有就是没有（不猜测、不补全） */
function transcribe(m, direction, subject) {
  const f = m.from ?? {}
  const ev = {
    domain: 'collab',
    type: 'collab.message.received',
    severity: 'info',
    direction,
    subject,
    peerDevice: f.device ?? '',
    peerName: f.name ?? '',
    mode: m.mode ?? 'notify',
  }
  // 身份三元组整体来自 Hub 回填；agentId 缺席则 owner/role 也一并不写（不得半可信）
  if (typeof f.agentId === 'string' && f.agentId !== '') {
    ev.peerAgentId = f.agentId
    if (typeof f.ownerUsername === 'string' && f.ownerUsername !== '') ev.peerOwner = f.ownerUsername
    if (typeof f.role === 'string' && f.role !== '') ev.peerRole = f.role
  }
  if (typeof m.taskId === 'string' && m.taskId !== '') ev.taskId = m.taskId
  if (typeof m.replyTo === 'string' && m.replyTo !== '') ev.replyTo = m.replyTo
  return ev
}

/** 假桥：真实实例用 Yuyi 桥的投递回调替换（YuyiSender 字段名见 packages/protocol/protocol.ts） */
function readFromYuyi() {
  return [
    // 1) 入向 · 新版御符：Hub 回填了 agentId/ownerUsername/role（avatar = 主人数字分身）
    { m: { from: { device: 'master-pc', name: 'yufu-owner', agentId: 'yf-0001a2b3', ownerUsername: 'lome', role: 'avatar' }, text: '看下 ops-pi 进度', mode: 'notify', taskId: 'OPSP-P2' }, direction: 'inbound' },
    // 2) 入向 · 兄弟实例（worker 角色）
    { m: { from: { device: 'ops-node', name: 'ops-pi-01', agentId: 'yf-0009ff01', ownerUsername: 'lome', role: 'worker' }, text: 'OPSP-P0 完成，请复核', mode: 'mail', replyTo: 'yf-0001a2b3' }, direction: 'inbound' },
    // 3) 出向 · 本实例发出的请求（对端身份同样来自回填）
    { m: { from: { device: 'arch-node', name: 'dsh-architect-01', agentId: 'yf-0002c4d5', ownerUsername: 'lome', role: 'coder' }, text: '请提供构建产物哈希', mode: 'notify' }, direction: 'outbound' },
    // 4) 入向 · 老 Hub 未回填身份 → 整体缺席（平台显示「未验证」，合法降级）
    { m: { from: { device: 'legacy-node', name: 'old-agent', sessionID: 'sess-77' }, text: '你好（身份未回填）', mode: 'notify' }, direction: 'inbound' },
  ]
}

let n = 0
for (const { m, direction } of readFromYuyi()) {
  const ev = transcribe(m, direction, `demo:${++n}`)
  emit(ev)
  console.log(`[collab-demo] ${direction.padEnd(8)} peer=${ev.peerAgentId ?? '（未验证）'}${ev.peerRole ? ' role=' + ev.peerRole : ''} owner=${ev.peerOwner ?? '-'}`)
}

// 治理执行证据：闸门拒绝（终止/屏蔽在注入/回信侧生效）
const gateDenied = [
  { decision: 'terminated', reason: 'agent 已由 主人 终止（越权写路径）', subject: 'yf-0009ff01' },
  { decision: 'unavailable', reason: 'gate_unavailable 且严格模式 → 保守拒绝回信', subject: 'outbound-reply' },
]
for (const g of gateDenied) {
  emit({ domain: 'collab', type: 'collab.gate-denied', severity: 'warning', direction: 'inbound', subject: g.subject, decision: g.decision, reason: g.reason, peerAgentId: 'yf-0009ff01', peerOwner: 'lome', peerRole: 'worker' })
  console.log(`[collab-demo] gate-denied decision=${g.decision} subject=${g.subject}`)
}
console.log(`[collab-demo] 已写入 ${n} 条消息事件 + ${gateDenied.length} 条闸门拒绝事件 → ${join(OBS, 'events', INST_ID)}`)
