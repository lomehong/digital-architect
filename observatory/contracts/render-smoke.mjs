#!/usr/bin/env node
/**
 * render-smoke.mjs — 看板渲染烟测（零依赖，无浏览器）。
 *
 * 目的：public/index.html 的内嵌 JS 无构建、无测试；语法错或字段漂移会导致白屏，
 * 而白屏只有人打开浏览器才被发现。本脚本用最小 DOM stub 在 node:vm 中真实执行
 * render()，对全部视图逐一断言「不抛错 + 关键内容在位 + 无 undefined/NaN 泄漏」。
 *
 * 用法：node contracts/render-smoke.mjs     # 任一视图失败 → exit 1
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(HERE, '..', 'public', 'index.html'), 'utf8')
const m = html.match(/<script>([\s\S]*?)<\/script>/)
if (!m) { console.error('[render-smoke] FAIL：index.html 未找到内嵌 script'); process.exit(1) }
// 追加探针：暴露同作用域的 SNAP/VIEW/render（render 是函数声明，SNAP/VIEW 是 let）
const src = m[1] + '\n;globalThis.__probe = { set SNAP(v){SNAP=v}, set VIEW(v){VIEW=v}, render }\n'

// ---- 最小 DOM stub：只提供 render 路径真正触达的接口 ----
const nodes = {}
const node = (sel) => nodes[sel] || (nodes[sel] = { sel, innerHTML: '', textContent: '', value: '', dataset: {}, style: {}, classList: { add() {}, remove() {} }, onclick: null })
const ctx = {
  document: { querySelector: (s) => node(s), querySelectorAll: () => [], addEventListener: () => {}, getElementById: (id) => node('#' + id) },
  window: {},
  location: { hash: '' },
  fetch: async () => ({ json: async () => ({}) }),
  // 定时器 stub：脚本末尾的自动刷新不得在烟测中真正排程（返回 0 句柄）
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: () => 0,
  console,
}
vm.createContext(ctx)
try { vm.runInContext(src, ctx) } catch (e) {
  console.error('[render-smoke] FAIL：内嵌 JS 执行失败（语法/顶层错误）— ' + e.message); process.exit(1)
}
const probe = ctx.__probe

// ---- 契约样例快照（含三态：在线/离线实例、已验证/未验证对端、无告警）----
const ts = '2026-09-12T08:00:00.000Z'
const snap = {
  generatedAt: ts,
  lastError: null,
  instances: [
    { instanceId: 'omp-ops-pi-01', hostType: 'omp', systems: ['ops-pi'], status: 'online', lastSeenAt: ts, heartbeatIntervalSec: 60 },
    { instanceId: 'dsh-architect-01', hostType: 'dsh', systems: ['digital-architect'], status: 'offline', lastSeenAt: ts, heartbeatIntervalSec: 30 },
  ],
  events: [
    { ts, instanceId: 'omp-ops-pi-01', hostType: 'omp', system: 'ops-pi', domain: 'collab', type: 'collab.message.received', severity: 'info', direction: 'inbound', subject: 'demo:1', peerAgentId: 'yf-0001a2b3', peerOwner: 'lome', peerRole: 'avatar', peerName: 'yufu-owner', peerDevice: 'master-pc' },
    { ts, instanceId: 'omp-ops-pi-01', hostType: 'omp', system: 'ops-pi', domain: 'collab', type: 'collab.message.received', severity: 'info', direction: 'inbound', subject: 'demo:2', peerName: 'old-agent', peerDevice: 'legacy-node' },
    { ts, instanceId: 'omp-ops-pi-01', hostType: 'omp', system: 'ops-pi', domain: 'collab', type: 'collab.gate-denied', severity: 'warning', subject: 'yf-0009ff01', decision: 'terminated', reason: 'agent 已由 主人 终止' },
    { ts, instanceId: 'omp-ops-pi-01', hostType: 'omp', system: 'ops-pi', domain: 'knowledge', type: 'knowledge.promoted', severity: 'info', subject: 'observatory-platform-bootstrap' },
  ],
  tasks: { 'OPSP-P0': { taskId: 'OPSP-P0', state: '执行中', system: 'ops-pi', by: 'omp-ops-pi-01', ts, source: 'ledger' } },
  reviewQueue: { entries: 0, raw: '' },
  alerts: [],
  governance: [{ ts, instanceId: 'observatory-platform', hostType: 'dsh', system: 'digital-architect', domain: 'governance', type: 'governance.confirm', severity: 'info', subject: 'GOV-TEST', payload: { by: '主人', via: 'observatory' } }],
  pendingApprovals: [{ requestId: 'req-smoke-1', instanceId: 'omp-ops-pi-01', tool: 'ops:exec', reason: '高危命令', requiredBy: '2026-09-12T09:00:00.000Z' }],
  runtime: { available: true, models: [{ model: 'deepseek-flash', samples: 194, outputTokens: 12345, avgGenMs: 2100, avgTtftMs: 320 }] },
  collab: {
    peers: [
      { peerKey: 'yf-0001a2b3', agentId: 'yf-0001a2b3', owner: 'lome', role: 'avatar', device: 'master-pc', name: 'yufu-owner', inbound: 1, outbound: 0, identityVerified: true, systems: { 'ops-pi': 1 }, lastTs: ts, lastSubject: 'demo:1' },
      { peerKey: '未验证:old-agent', agentId: '', owner: '', role: '', device: 'legacy-node', name: 'old-agent', inbound: 1, outbound: 0, identityVerified: false, systems: { 'ops-pi': 1 }, lastTs: ts, lastSubject: 'demo:2' },
    ],
    totals: { peers: 2, verified: 1, unverified: 1, inbound: 2, outbound: 0, gateDenied: 1 },
  },
  identity: {
    rows: [
      { instanceId: 'omp-ops-pi-01', state: '已验证', identityId: 'yf-smoke-a1', owner: 'lome', role: 'worker', permissions: ['yufu:whoami', 'yuyi:send'], via: 'yufu_verify', checkedAt: ts, ageSec: 42, reason: '', drift: '' },
      { instanceId: 'dsh-architect-01', state: '失效', identityId: 'yf-smoke-b1', owner: '', role: '', permissions: [], via: 'yufu_verify', checkedAt: ts, ageSec: 900, reason: 'token 已过期', drift: '身份漂移：同一实例先后自验为 yf-smoke-b0 / yf-smoke-b1' },
    ],
    totals: { verified: 1, failed: 1, unreported: 0 },
  },
  roots: [
    { instanceId: 'omp-ops-pi-01', taskRoot: 'E:\\Development\\Code\\nodejs\\ops-pi', label: 'ops-pi 容器实例', status: 'online', systems: ['ops-pi'] },
    { instanceId: 'dsh-architect-01', taskRoot: 'E:\\Development\\Code\\nodejs\\digital-architect', label: '建设会话', status: 'offline', systems: ['digital-architect'] },
  ],
  addressBookSource: 'observatory/data-roots.yml',
}

// 视图 → 必须出现的内容片段（防止字段漂移导致静默空渲染）
const EXPECT = {
  team: ['omp-ops-pi-01', '无告警', '审批代办', '治理留痕', '身份自验', '✅ 已验证', '❌ 失效', '身份漂移'],
  systems: ['系统：ops-pi', 'OPSP-P0'],
  instances: ['omp-ops-pi-01', 'online', '御符 yf-smoke-a1', 'yufu_verify', '身份漂移'],
  collab: ['协作总览', 'Hub 回填', '未验证', 'avatar（主人数字分身）', '闸门拒绝'],
  knowledge: ['评审队列', 'observatory-platform-bootstrap'],
  govern: ['跨实例统一治理', 'task-ledger', '地址簿来源', 'data-roots.yml', '知识条目升级', 'ops-pi 容器实例'],
  runtime: ['deepseek-flash', '194'],
  events: ['事件实时流', 'collab/collab.message.received'],
}
const VIEWS = ['team', 'systems', 'instances', 'collab', 'knowledge', 'govern', 'runtime', 'events']

probe.SNAP = snap
const problems = []
for (const v of VIEWS) {
  try {
    probe.VIEW = v
    probe.render()
    const out = node('#view').innerHTML
    if (out.trim().length < 40) problems.push(`${v}: 渲染输出过短（${out.length} 字符）`)
    if (out.includes('undefined')) problems.push(`${v}: 输出含 undefined`)
    if (out.includes('NaN')) problems.push(`${v}: 输出含 NaN`)
    for (const frag of EXPECT[v]) if (!out.includes(frag)) problems.push(`${v}: 缺少关键内容「${frag}」`)
  } catch (e) {
    problems.push(`${v}: render 抛错 — ${e.message}`)
  }
}

// 反向验证：collab 汇总缺席时不得抛错（无跨 Agent 通信的开箱态）
try {
  probe.SNAP = { ...snap, collab: undefined, events: [] }
  probe.VIEW = 'collab'
  probe.render()
  if (!node('#view').innerHTML.includes('暂无协作消息事件')) problems.push('collab 空态：未显示预期空态提示')
} catch (e) { problems.push('collab 空态: render 抛错 — ' + e.message) }

// 反向验证：无待决事项时朱批操作台不得渲染（拍板门——只有需要主人决定时才出现）
try {
  probe.SNAP = { ...snap, pendingApprovals: [], reviewQueue: { entries: 0, raw: '' }, tasks: { 'OPSP-P0': { ...snap.tasks['OPSP-P0'], state: '执行中' } }, governorOrders: { pending: [], done: [], signKeyConfigured: false } }
  probe.VIEW = 'govern'
  probe.render()
  const out = node('#view').innerHTML
  if (!out.includes('当前无需主人拍板的事项')) problems.push('govern 空态：未显示「无需拍板」提示')
  if (out.includes('class="zh-sec"') || out.includes('class="zh-cap"')) problems.push('govern 空态：操作台不应渲染（朱批只在有待决时出现）')
} catch (e) { problems.push('govern 空态: render 抛错 — ' + e.message) }

if (problems.length > 0) {
  console.error(`[render-smoke] FAIL（${VIEWS.length + 2} 场景检查）`)
  for (const p of problems) console.error('[render-smoke]   - ' + p)
  process.exit(1)
}
console.log(`[render-smoke] PASS：${VIEWS.length} 视图渲染正常 + 2 项空态/拍板门场景正常（无浏览器）`)
