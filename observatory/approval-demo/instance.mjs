#!/usr/bin/env node
/**
 * approval-demo/instance.mjs — 审批代办契约 v1 的参考实现（一次性脚本）。
 *
 * 流程：写 pending + 发 requested 事件 → 轮询决定 → 收到后发 received 事件 + 清理 pending。
 * 复制到实际实例的运行时，按需改成后台守护。
 *
 * 用法：node approval-demo/instance.mjs [OBS_ROOT]
 *   OBS_ROOT 默认 = 当前工作目录解析到的 obs/ 父（向上找含 obs/instances 的目录）；可显式传 E:/.../obs
 */
import { writeFileSync, readFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 安全护栏：演示数据只允许写入显式指定的隔离数据根，禁止自动发现/写入生产 obs/
const MAIN_OBS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'obs')
const OBS = process.argv[2]
if (!OBS) { console.error('[demo] 必须显式指定数据根：node approval-demo/instance.mjs <OBS_ROOT>（禁止自动写入生产 obs/）'); process.exit(2) }
if (resolve(OBS) === MAIN_OBS) { console.error('[demo] 拒绝：目标是生产数据根。演示数据只能写入临时/隔离数据根'); process.exit(2) }

const INST_ID = 'approval-demo-01'
const REQ = 'req-' + randomUUID()
const PENDING = join(OBS, 'approvals/pending', `${REQ}.json`)
const DECISION = join(OBS, 'approvals/decisions', `${REQ}.json`)
mkdirSync(join(OBS, 'approvals/pending'), { recursive: true })
mkdirSync(join(OBS, 'approvals/decisions'), { recursive: true })
mkdirSync(join(OBS, 'events', INST_ID), { recursive: true })

function emit(type, severity, subject, payload) {
  appendFileSync(
    join(OBS, 'events', INST_ID, new Date().toISOString().slice(0, 10) + '.ndjson'),
    JSON.stringify({ ts: new Date().toISOString(), instanceId: INST_ID, hostType: 'dsh', system: 'digital-architect', domain: 'runtime', type, severity, subject, payload }) + '\n'
  )
}

const requestedAt = new Date()
const requiredBy = new Date(Date.now() + 5 * 60 * 1000) // 5 分钟超时
const pending = {
  requestId: REQ,
  ts: requestedAt.toISOString(),
  instanceId: INST_ID,
  subject: { tool: 'demo:dangerous-op', params: { cmd: 'echo DEMO_REQUEST' } },
  reason: '演示审批契约 v1（批准后 writeFile 触发，被拒绝时跳过）',
  requiredBy: requiredBy.toISOString(),
  callbacks: { decisionFile: DECISION },
  context: { sessionId: process.pid, note: 'one-shot demo' },
}
writeFileSync(PENDING, JSON.stringify(pending, null, 2))
emit('approval.requested', 'info', REQ, { tool: pending.subject.tool, requiredBy: pending.requiredBy })
console.log(`[demo] 已写 pending：${PENDING}`)
console.log(`[demo] 等待决定：${DECISION}（超时 ${pending.requiredBy}）`)

const start = Date.now()
const TIMEOUT_MS = 5 * 60 * 1000
const POLL_MS = 1500
let decided = false
while (Date.now() - start < TIMEOUT_MS) {
  if (existsSync(DECISION)) {
    const d = JSON.parse(readFileSync(DECISION, 'utf8'))
    emit('approval.received', 'info', REQ, d)
    console.log(`[demo] 收到决定：${d.decision} by ${d.by}${d.reason ? ' — ' + d.reason : ''}`)
    try { unlinkSync(PENDING) } catch { /* 保留供审计 */ }
    decided = true
    break
  }
  await new Promise((r) => setTimeout(r, POLL_MS))
}
if (!decided) {
  emit('approval.timeout', 'warning', REQ, { waitedMs: Date.now() - start })
  console.log('[demo] 超时未决 — 主人可到平台写超时拒绝 / 实例重报')
}
