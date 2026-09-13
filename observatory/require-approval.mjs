#!/usr/bin/env node
/**
 * require-approval.mjs — 审批代办契约 v1 的实例侧真实工具（原 approval-demo 转正，2026-09-12）。
 *
 * 场景：实例/会话在执行高风险动作前，把决定权交给主人——写 pending 挂单到数据根，
 * 主人在看板「审批挂单」批准/拒绝（或超时由平台自动拒绝），本工具轮询决定文件并以
 * **退出码**返回结论，可直接作为脚本/流水线的门闩：
 *   exit 0 = allow（已批准，继续执行）
 *   exit 1 = deny（已拒绝，停止）
 *   exit 2 = 超时未决（保守失败，停止；主人可事后处置留痕）
 *   exit 3 = 参数/写入错误
 *
 * 用法：
 *   node require-approval.mjs --instance <实例id> --tool <工具名> [--params-json '{"...":"..."}']
 *        [--reason <理由>] [--required-by-sec 300] [--obs <数据根>] [--host-type dsh] [--system <系统>]
 * 契约：contracts/approval-request-v1.md（pending/decisions 文件 + approval.* 事件）。
 * 决定权在主人：本工具只搬动事实，绝不自写决定文件。
 */
import { writeFileSync, readFileSync, appendFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ARGV = process.argv
const argOf = (n, d = '') => { const i = ARGV.indexOf(n); return i > 0 ? ARGV[i + 1] : d }
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const OBS = resolve(argOf('--obs', join(SCRIPT_DIR, '..', 'obs')))
const INSTANCE = argOf('--instance')
const HOST_TYPE = argOf('--host-type', 'dsh')
const SYSTEM = argOf('--system', 'digital-architect')
const TOOL = argOf('--tool')
const PARAMS_RAW = argOf('--params-json', '{}')
const REASON = argOf('--reason', '')
const REQUIRED_BY_SEC = Number(argOf('--required-by-sec', '300'))
const POLL_MS = Math.max(300, Number(argOf('--poll-ms', '1500')))

const fail = (msg) => { console.error(`[require-approval] ${msg}`); process.exit(3) }
if (!INSTANCE) fail('缺 --instance <实例id>（真实实例身份，不代填）')
if (!TOOL) fail('缺 --tool <工具名>（被门闩保护的动作）')
let params
try { params = JSON.parse(PARAMS_RAW) } catch { fail(`--params-json 不是合法 JSON：${PARAMS_RAW.slice(0, 80)}`) }

const REQ = 'req-' + randomUUID()
const PENDING = join(OBS, 'approvals', 'pending', `${REQ}.json`)
const DECISION = join(OBS, 'approvals', 'decisions', `${REQ}.json`)
const EVENT_DIR = join(OBS, 'events', INSTANCE)
mkdirSync(join(OBS, 'approvals', 'pending'), { recursive: true })
mkdirSync(join(OBS, 'approvals', 'decisions'), { recursive: true })
mkdirSync(EVENT_DIR, { recursive: true })

const emit = (type, severity, payload) => {
  appendFileSync(join(EVENT_DIR, new Date().toISOString().slice(0, 10) + '.ndjson'),
    JSON.stringify({ ts: new Date().toISOString(), instanceId: INSTANCE, hostType: HOST_TYPE, system: SYSTEM, domain: 'runtime', type, severity, subject: REQ, payload }) + '\n')
}

const requiredBy = new Date(Date.now() + REQUIRED_BY_SEC * 1000).toISOString()
const pending = {
  requestId: REQ,
  ts: new Date().toISOString(),
  instanceId: INSTANCE,
  subject: { tool: TOOL, params },
  reason: REASON,
  requiredBy,
  callbacks: { decisionFile: DECISION },
  context: { pid: process.pid, cwd: process.cwd() },
}
writeFileSync(PENDING, JSON.stringify(pending, null, 2))
emit('approval.requested', 'info', { tool: TOOL, reason: REASON, requiredBy })
console.log(`[require-approval] 挂单 ${REQ}：${TOOL}`)
console.log(`[require-approval] 等待主人在看板决定（超时 ${requiredBy}）→ ${DECISION}`)

const start = Date.now()
while (Date.now() - start < REQUIRED_BY_SEC * 1000) {
  if (existsSync(DECISION)) {
    let d
    try { d = JSON.parse(readFileSync(DECISION, 'utf8')) } catch (e) {
      // 决定文件损坏 = 保守失败（契约 §七）
      emit('approval.resolved', 'warning', { decision: 'deny', by: 'contract-guard', reason: `决定文件解析失败：${e.message}` })
      console.error(`[require-approval] 决定文件损坏，按拒绝处理：${e.message}`)
      try { unlinkSync(PENDING) } catch { /* 保留供审计 */ }
      process.exit(1)
    }
    emit('approval.received', 'info', { decision: d.decision, by: d.by, reason: d.reason || '' })
    console.log(`[require-approval] 主人决定：${d.decision}${d.by ? '（by ' + d.by + '）' : ''}${d.reason ? ' — ' + d.reason : ''}`)
    try { unlinkSync(PENDING) } catch { /* 保留供审计 */ }
    process.exit(d.decision === 'allow' ? 0 : 1)
  }
  await new Promise((r) => setTimeout(r, POLL_MS))
}
emit('approval.timeout', 'warning', { waitedSec: REQUIRED_BY_SEC })
console.error('[require-approval] 超时未决——保守失败，停止执行（主人可到平台补看挂单历史）')
process.exit(2)
