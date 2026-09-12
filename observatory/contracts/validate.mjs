#!/usr/bin/env node
/**
 * validate.mjs — Architect Observatory 事件契约 v1 校验器（零依赖）。
 *
 * 用法：node validate.mjs <file.ndjson> [<file2.ndjson> ...]
 *   逐行 JSON 解析并断言契约 v1 信封；尾残行跳过并计数；任何违例 exit 1。
 *
 * 契约 v1（docs/design/observatory-architecture-design.md §7.2）：
 *   必填 ts(ISO) / instanceId / hostType(枚举) / system / domain(枚举) / type(非空) / severity(枚举)
 *   hostType: dsh | omp | <其他小写串>
 *   domain:   task | design | review | runtime | knowledge | collab | governance | platform
 *   severity: info | warning | critical
 *
 * 域约定（§7.2.1 御驿消息结构化，二期）：
 *   collab.message.*  须带 direction(inbound|outbound)；对端身份字段可选——
 *                     peerAgentId/peerOwner/peerRole 来自 Yuyi Hub 权威回填，实例只转写不自造。
 *                     peerAgentId 缺席 = 身份未验证（老 Hub 不回填），合法且必须显式缺席，
 *                     不得用 peerOwner/peerName 冒充已验证身份。
 *   collab.gate-denied  须带 decision 与 reason（治理执行证据：终止/屏蔽在注入/回信侧生效）。
 */
import { readFileSync } from 'node:fs'

const DOMAINS = new Set(['task', 'design', 'review', 'runtime', 'knowledge', 'collab', 'governance', 'platform'])
const SEVERITIES = new Set(['info', 'warning', 'critical'])
/** 御符角色（Yuyi protocol.ts：avatar/worker/coder/未设置）；空串 = 老御符未回填，按「未设置」降级 */
const PEER_ROLES = new Set(['avatar', 'worker', 'coder', ''])

const problems = []
let total = 0
let skippedTails = 0

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const ln = line.trim()
    if (ln === '') return
    let ev
    try { ev = JSON.parse(ln) } catch {
      // NDJSON 尾部残行（进程中断截断）容忍：仅当为最后一行
      if (i === lines.length - 1 || (i === lines.length - 2 && lines[lines.length - 1].trim() === '')) skippedTails++
      else problems.push(`${file}:${i + 1} 非法 JSON`)
      return
    }
    total++
    const where = `${file}:${i + 1}`
    for (const k of ['ts', 'instanceId', 'hostType', 'system', 'domain', 'type', 'severity']) {
      if (typeof ev[k] !== 'string' || ev[k] === '') problems.push(`${where} 缺必填 ${k}`)
    }
    if (ev.ts !== undefined && isNaN(Date.parse(ev.ts))) problems.push(`${where} ts 非法 ISO 时间：${ev.ts}`)
    if (ev.domain !== undefined && !DOMAINS.has(ev.domain)) problems.push(`${where} 非法 domain：${ev.domain}`)
    if (ev.severity !== undefined && !SEVERITIES.has(ev.severity)) problems.push(`${where} 非法 severity：${ev.severity}`)
    if (ev.type !== undefined && typeof ev.type === 'string' && ev.type.includes('.') === false && ev.domain && !ev.type.startsWith(ev.domain)) {
      // 软约定：type 建议带域前缀（如 task.state.changed）；不 FAIL，仅提示
      problems.push(`${where} type 建议使用域前缀形态（${ev.domain}.xxx）：${ev.type}`)
    }

    // ---- 域约定：collab（御驿消息结构化）----
    if (ev.domain === 'collab' && typeof ev.type === 'string') {
      if (ev.type.startsWith('collab.message')) {
        if (ev.direction !== 'inbound' && ev.direction !== 'outbound') {
          problems.push(`${where} collab.message 须带 direction(inbound|outbound)：${ev.direction}`)
        }
        if (ev.peerRole !== undefined && !PEER_ROLES.has(ev.peerRole)) {
          problems.push(`${where} 非法 peerRole（仅 avatar|worker|coder|空串）：${ev.peerRole}`)
        }
        const hasId = typeof ev.peerAgentId === 'string' && ev.peerAgentId !== ''
        const hasOwner = typeof ev.peerOwner === 'string' && ev.peerOwner !== ''
        if (hasOwner && !hasId) {
          problems.push(`${where} peerOwner 存在但 peerAgentId 缺席——不得单独采信 Owner 字段（身份须整体来自 Hub 回填）`)
        }
      }
      if (ev.type.startsWith('collab.gate-denied')) {
        if (ev.decision !== 'terminated' && ev.decision !== 'blocked' && ev.decision !== 'target_terminated' && ev.decision !== 'target_blocked' && ev.decision !== 'rate_limited' && ev.decision !== 'unavailable') {
          problems.push(`${where} collab.gate-denied 须带 decision（闸门评估结论）：${ev.decision}`)
        }
        if (typeof ev.reason !== 'string' || ev.reason === '') {
          problems.push(`${where} collab.gate-denied 须带 reason（拒绝依据，治理留痕）`)
        }
      }
    }

    // ---- 域约定：platform 身份自验证据（§7.1 身份三态之「自验」）----
    // 平台不接御符内部 API；验证在实例侧完成（yufu_verify），本事件是平台存档的证据。
    if (ev.domain === 'platform' && typeof ev.type === 'string' && ev.type.startsWith('platform.identity.verified')) {
      if (typeof ev.identityId !== 'string' || ev.identityId === '') problems.push(`${where} platform.identity.verified 须带 identityId（御符 id）`)
      if (typeof ev.verified !== 'boolean') problems.push(`${where} platform.identity.verified 须带 verified(boolean)：${ev.verified}`)
      if (typeof ev.via !== 'string' || ev.via === '') problems.push(`${where} platform.identity.verified 须带 via（验证来源，如 yufu_verify）`)
      if (ev.permissions !== undefined && !Array.isArray(ev.permissions)) problems.push(`${where} permissions 须为数组`)
      if (ev.verified === false && (typeof ev.reason !== 'string' || ev.reason === '')) problems.push(`${where} verified=false 须带 reason（失效依据）`)
    }
  })
}

if (problems.length > 0) {
  console.error(`[validate] FAIL（${total} 事件，尾残行跳过 ${skippedTails}）`)
  for (const p of problems) console.error(`[validate]   - ${p}`)
  process.exit(1)
}
console.log(`[validate] PASS：${total} 事件符合契约 v1（尾残行跳过 ${skippedTails}）`)
