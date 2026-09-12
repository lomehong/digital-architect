/**
 * instance-beat.mjs — 实例注册文件的「心跳字段」刷新（server.mjs 与 heartbeat.mjs 共用，零依赖）。
 *
 * 语义：**只更新** status / lastSeenAt / heartbeatIntervalSec，
 * 保留实例自身声明的其余字段（systems / capabilities / host / hostType…）——心跳不覆盖身份声明。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

/** @returns {boolean} 文件存在并已刷新返回 true；不存在返回 false（创建交给调用方） */
export function beatInstance(yamlPath, intervalSec, ts = new Date().toISOString()) {
  if (!existsSync(yamlPath)) return false
  let out = readFileSync(yamlPath, 'utf8')
  const setLine = (re, line) => { out = re.test(out) ? out.replace(re, line) : out.replace(/\s*$/, `\n${line}\n`) }
  setLine(/^lastSeenAt:.*$/m, `lastSeenAt: ${ts}`)
  setLine(/^status:.*$/m, 'status: online')
  setLine(/^heartbeatIntervalSec:.*$/m, `heartbeatIntervalSec: ${intervalSec}`)
  writeFileSync(yamlPath, out)
  return true
}
