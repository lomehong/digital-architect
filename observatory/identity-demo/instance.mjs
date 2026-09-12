#!/usr/bin/env node
/**
 * identity-demo/instance.mjs — 身份自验证据（§7.1 身份三态之「自验」）的参考实现 / 端到端夹具。
 *
 * 语义边界：**平台不做身份验证**（不接御符内部 API、不持管理凭证）。验证由实例侧完成，
 * 平台只存档 `platform.identity.verified` 证据并如实呈现。本脚本演示四种情形：
 *   A 已验证 · B 失效（token 过期）· C 未申报 · D 身份漂移（同一实例先后自验出不同御符 id）
 *
 * 真实实例的接入方式（本脚本的 simulate 分支替换为真实调用即可）：
 *   POST {YUFU_URL}/api/v1/auth/agent/verify   body {"token":"<御符 token>"}
 *   → 取回 agent_id / owner / role / permissions，然后上报本事件。
 *   （字段名以御符实际返回为准；响应形态不一致时以实测修正，勿猜。）
 *
 * 用法：node identity-demo/instance.mjs [OBS_ROOT]
 *   设置 YUFU_URL + YUFU_CREDENTIAL 时走真实验证；否则用演示数据（打印标注）。
 */
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// 安全护栏：演示数据只允许写入显式指定的隔离数据根，禁止自动发现/写入生产 obs/
const MAIN_OBS = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'obs')
const OBS = process.argv[2]
if (!OBS) { console.error('[identity-demo] 必须显式指定数据根：node identity-demo/instance.mjs <OBS_ROOT>（禁止自动写入生产 obs/）'); process.exit(2) }
if (resolve(OBS) === MAIN_OBS) { console.error('[identity-demo] 拒绝：目标是生产数据根。模拟身份证据只能写入临时/隔离数据根'); process.exit(2) }

const YUFU_URL = process.env.YUFU_URL
const CRED = process.env.YUFU_CREDENTIAL || ''
const REAL = Boolean(YUFU_URL && CRED)

mkdirSync(join(OBS, 'instances'), { recursive: true })

function register(instanceId, systems) {
  mkdirSync(join(OBS, 'events', instanceId), { recursive: true })
  writeFileSync(join(OBS, 'instances', `${instanceId}.yaml`), [
    `instanceId: ${instanceId}`,
    'hostType: omp',
    `host: identity-demo 夹具`,
    `systems: [${systems.join(', ')}]`,
    'capabilities: [demo]',
    'status: online',
    `lastSeenAt: ${new Date().toISOString()}`,
    'heartbeatIntervalSec: 3600',
  ].join('\n') + '\n')
}
function emit(instanceId, ev) {
  appendFileSync(
    join(OBS, 'events', instanceId, new Date().toISOString().slice(0, 10) + '.ndjson'),
    JSON.stringify({ ts: new Date().toISOString(), instanceId, hostType: 'omp', system: 'identity-demo', ...ev }) + '\n'
  )
}

/** 统一上报：verified=true/false 都由实例侧得出，平台只存档 */
function reportIdentity(instanceId, r) {
  const ev = {
    domain: 'platform',
    type: 'platform.identity.verified',
    severity: r.verified ? 'info' : 'warning',
    subject: instanceId,
    identityId: r.identityId,
    verified: r.verified,
    via: REAL ? 'yufu_verify' : 'yufu_verify(simulated)',
  }
  if (r.owner) ev.owner = r.owner
  if (r.role) ev.role = r.role
  if (Array.isArray(r.permissions)) ev.permissions = r.permissions
  if (!r.verified && r.reason) ev.reason = r.reason
  emit(instanceId, ev)
  console.log(`[identity-demo] ${instanceId.padEnd(18)} ${r.verified ? '✅ 已验证' : '❌ 失效'} identityId=${r.identityId}${r.reason ? ' reason=' + r.reason : ''}`)
}

if (REAL) {
  // ---- 真实路径：向御符验证本实例 token ----
  const instanceId = process.env.OBS_INSTANCE_ID || 'identity-demo-real'
  register(instanceId, ['demo'])
  try {
    const res = await fetch(`${YUFU_URL.replace(/\/$/, '')}/api/v1/auth/agent/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CRED }),
    })
    const j = await res.json()
    reportIdentity(instanceId, {
      verified: res.ok && j.valid !== false && Boolean(j.agent_id || j.agentId),
      identityId: j.agent_id || j.agentId || '',
      owner: j.owner || j.ownerUsername || '',
      role: j.role || '',
      permissions: j.permissions || j.scopes || [],
      reason: res.ok ? '' : `HTTP ${res.status}`,
    })
  } catch (e) {
    reportIdentity(instanceId, { verified: false, identityId: '', reason: `验证请求失败：${e.message}` })
  }
} else {
  console.log('[identity-demo] 未设置 YUFU_URL + YUFU_CREDENTIAL → 使用演示数据（非真实验证结果，仅演示契约与看板呈现）')
  // A：已验证
  register('identity-demo-A', ['demo-a'])
  reportIdentity('identity-demo-A', { verified: true, identityId: 'yf-demo-a1', owner: 'lome', role: 'worker', permissions: ['yufu:whoami', 'yuyi:send', 'ops:read'] })
  // B：失效（token 过期）
  register('identity-demo-B', ['demo-b'])
  reportIdentity('identity-demo-B', { verified: false, identityId: 'yf-demo-b1', reason: 'token 已过期（401 invalid_token）' })
  // C：仅注册，未申报身份（平台显示「未申报」，不推测）
  register('identity-demo-C', ['demo-c'])
  console.log('[identity-demo] identity-demo-C      （仅注册，未申报身份）')
  // D：身份漂移——同一实例先后自验出不同御符 id，平台应显式提示
  register('identity-demo-D', ['demo-d'])
  reportIdentity('identity-demo-D', { verified: true, identityId: 'yf-demo-d1', owner: 'lome', role: 'coder', permissions: ['yuyi:send'] })
  reportIdentity('identity-demo-D', { verified: true, identityId: 'yf-demo-d2', owner: 'lome', role: 'coder', permissions: ['yuyi:send'] })
}
console.log(`[identity-demo] 事件已写入 → ${join(OBS, 'events')}`)
