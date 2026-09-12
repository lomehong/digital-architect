#!/usr/bin/env node
/**
 * heartbeat.mjs — 实例心跳与（可选）身份自验上报工具（零依赖）。
 *
 * 为什么需要它：observatory 的实例接入原先只有两条路——omp 容器内 entrypoint 的心跳循环、
 * 或手工写 `obs/instances/<id>.yaml`。dsh 及其它宿主没有常驻心跳工具，实例会一直显示 offline。
 * 本工具补齐这一缺口：**只更新心跳字段，保留实例自身声明的其余字段**（systems/capabilities 等）。
 *
 * 用法：
 *   node observatory/heartbeat.mjs --instance dsh-architect-01 [--interval 60]
 *   node observatory/heartbeat.mjs --instance x --once                    # 单次（验证/CI）
 *   node observatory/heartbeat.mjs --instance x --systems a,b --host "描述" --host-type dsh   # 首次创建
 *
 * 身份自验（可选，不配置则不发——不伪造证据）：
 *   --yufu-url http://127.0.0.1:PORT  + 环境变量 YUFU_CREDENTIAL=<御符 token>
 *   → 调 POST /api/v1/auth/agent/verify，把结论作为 platform.identity.verified 事件上报。
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

// ---- 参数 ----
const args = process.argv.slice(2)
const get = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const has = (k) => args.includes(k)
const INSTANCE = get('--instance')
if (!INSTANCE) { console.error('[heartbeat] 必须提供 --instance <实例id>'); process.exit(2) }
const INTERVAL_SEC = Number(get('--interval', '60'))
const ONCE = has('--once')
const QUIET = has('--quiet')
const HOST_TYPE = get('--host-type', 'dsh')
const HOST = get('--host', '')
const SYSTEMS = (get('--systems', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const YUFU_URL = get('--yufu-url', '')
const CRED = process.env.YUFU_CREDENTIAL || ''

// 数据根：显式 --data > 向上找含 instances/ 的目录 > 脚本上级 obs/
function findObs(start) {
  let p = start
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(p, 'instances'))) return p
    if (existsSync(join(p, 'obs', 'instances'))) return join(p, 'obs')
    const up = dirname(p)
    if (up === p) break
    p = up
  }
  return null
}
const OBS = resolve(get('--data', '') || findObs(process.cwd()) || join(SCRIPT_DIR, '..', 'obs'))
const INSTANCES_DIR = join(OBS, 'instances')
const EVENTS_DIR = join(OBS, 'events', INSTANCE)
const YAML_PATH = join(INSTANCES_DIR, `${INSTANCE}.yaml`)
mkdirSync(INSTANCES_DIR, { recursive: true })
mkdirSync(EVENTS_DIR, { recursive: true })

const nowIso = () => new Date().toISOString()
const log = (m) => { if (!QUIET) console.log(`[heartbeat] ${nowIso()} ${m}`) }

/** 心跳写入：保留实例自身声明的字段，只刷新 status/lastSeenAt/heartbeatIntervalSec */
function beat() {
  const ts = nowIso()
  if (existsSync(YAML_PATH)) {
    const raw = readFileSync(YAML_PATH, 'utf8')
    let out = raw
    const setLine = (re, line) => { out = re.test(out) ? out.replace(re, line) : out.replace(/\s*$/, `\n${line}\n`) }
    setLine(/^lastSeenAt:.*$/m, `lastSeenAt: ${ts}`)
    setLine(/^status:.*$/m, 'status: online')
    setLine(/^heartbeatIntervalSec:.*$/m, `heartbeatIntervalSec: ${INTERVAL_SEC}`)
    writeFileSync(YAML_PATH, out)
  } else {
    // 首次创建：需要实例自报身份要素（缺 systems 时如实留空，不编造）
    writeFileSync(YAML_PATH, [
      `instanceId: ${INSTANCE}`,
      `hostType: ${HOST_TYPE}`,
      `host: ${HOST || '（未声明）'}`,
      `systems: [${SYSTEMS.join(', ')}]`,
      'capabilities: []',
      'status: online',
      `lastSeenAt: ${ts}`,
      `heartbeatIntervalSec: ${INTERVAL_SEC}`,
    ].join('\n') + '\n')
  }
  return ts
}

function emitEvent(ev) {
  appendFileSync(
    join(EVENTS_DIR, `${new Date().toISOString().slice(0, 10)}.ndjson`),
    JSON.stringify({ ts: nowIso(), instanceId: INSTANCE, hostType: HOST_TYPE, system: SYSTEMS[0] || 'unknown', ...ev }) + '\n'
  )
}

/**
 * 身份自验（可选）：实例侧调御符验证自身 token，把结论作为证据上报。
 * 未配置 URL/凭据 → 直接返回（**不发事件**——平台不做验证，也不接受凭空证据）。
 */
async function verifyIdentity() {
  if (!YUFU_URL || !CRED) return
  const ev = { domain: 'platform', type: 'platform.identity.verified', severity: 'info', subject: INSTANCE, via: 'yufu_verify' }
  try {
    const res = await fetch(`${YUFU_URL.replace(/\/$/, '')}/api/v1/auth/agent/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: CRED }),
    })
    const j = await res.json().catch(() => ({}))
    const id = j.agent_id || j.agentId || ''
    ev.verified = res.ok && j.valid !== false && Boolean(id)
    ev.identityId = id
    if (j.owner || j.ownerUsername) ev.owner = j.owner || j.ownerUsername
    if (j.role) ev.role = j.role
    if (Array.isArray(j.permissions)) ev.permissions = j.permissions
    if (!ev.verified) { ev.severity = 'warning'; ev.reason = res.ok ? '响应未含 agent_id/valid=false' : `HTTP ${res.status}` }
  } catch (e) {
    ev.verified = false
    ev.severity = 'warning'
    ev.identityId = ''
    ev.reason = `验证请求失败：${e.message}`
  }
  emitEvent(ev)
  log(`身份自验：${ev.verified ? '已验证' : '失效'} identityId=${ev.identityId || '(无)'}${ev.reason ? ' reason=' + ev.reason : ''}`)
}

// ---- 主循环 ----
log(`数据根 ${OBS} · 实例 ${INSTANCE} · 间隔 ${INTERVAL_SEC}s${ONCE ? ' · 单次模式' : ''}`)
log(YUFU_URL && CRED ? '身份自验：已启用（--yufu-url + YUFU_CREDENTIAL）' : '身份自验：未配置（不发证据事件）')

const tick = async () => {
  const ts = beat()
  log(`心跳已更新 → ${YAML_PATH} (${ts})`)
  await verifyIdentity()
}

await tick()
if (!ONCE) {
  const timer = setInterval(tick, INTERVAL_SEC * 1000)
  const stop = () => { clearInterval(timer); log('收到退出信号，已停止心跳'); process.exit(0) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
