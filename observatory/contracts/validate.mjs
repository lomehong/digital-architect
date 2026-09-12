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
 */
import { readFileSync } from 'node:fs'

const DOMAINS = new Set(['task', 'design', 'review', 'runtime', 'knowledge', 'collab', 'governance', 'platform'])
const SEVERITIES = new Set(['info', 'warning', 'critical'])

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
  })
}

if (problems.length > 0) {
  console.error(`[validate] FAIL（${total} 事件，尾残行跳过 ${skippedTails}）`)
  for (const p of problems) console.error(`[validate]   - ${p}`)
  process.exit(1)
}
console.log(`[validate] PASS：${total} 事件符合契约 v1（尾残行跳过 ${skippedTails}）`)
