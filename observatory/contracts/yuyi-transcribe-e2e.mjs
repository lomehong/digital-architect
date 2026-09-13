#!/usr/bin/env node
/**
 * yuyi-transcribe-e2e.mjs — 御驿协作消息实例侧转写验收回归（夹具隔离，无生产副作用）。
 *
 * 夹具 = 按**真实库表结构**（实机 ~/.yuyi/hub/inbox.db 实测 schema，2026-09-12）合成的 yuyi 状态目录。
 * 覆盖：
 *   ① Hub 回填身份的入向消息 → 三元组整体在位
 *   ② 老 Hub 无回填 → 身份字段整体缺席（不出现在事件 JSON 里）
 *   ③ delivered_index 按自身份判方向（inbound/outbound），无关行不搬
 *   ④ would_deny_events：词表内 action → gate-denied；词表外 → 跳过不编造
 *   ⑤ events.jsonl：terminated → gate-denied；released 非拒绝不转写
 *   ⑥ 投递失败 → collab.message.delivery-failed（warning）
 *   ⑦ 幂等：重复 --once 检查点去重，零重复
 *   ⑧ 隐私：任何事件不含消息正文 text
 *   ⑨ 全部事件过契约 v1（validate.mjs，含 peerOwner 无 peerAgentId 必 FAIL 的负规则）
 * 用法：node observatory/contracts/yuyi-transcribe-e2e.mjs   （exit 0 = 全部通过）
 */
import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OBS_TOOL = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fails = []
const ok = (cond, name) => { console.log(`${cond ? '✅' : '❌'} ${name}`); if (!cond) fails.push(name) }
const g = (args) => execFileSync('node', args, { encoding: 'utf8' })

const T = mkdtempSync(join(tmpdir(), 'obs-transcribe-e2e-'))
let completed = false
try {
  const now = Date.now()
  // ---- 夹具：yuyi 状态目录（真实 schema）----
  const yuyi = join(T, 'yuyi')
  mkdirSync(join(yuyi, 'hub'), { recursive: true })
  mkdirSync(join(yuyi, 'yuyi-agent'), { recursive: true })
  const db = new DatabaseSync(join(yuyi, 'hub', 'inbox.db'))
  db.exec(`CREATE TABLE recipients (recipient_id TEXT, agent_id TEXT, device TEXT, name TEXT, agent_kind TEXT, capabilities TEXT, first_seen INTEGER, last_seen INTEGER, owner_user_id TEXT, owner_username TEXT);
    CREATE TABLE messages (seq INTEGER, id TEXT, recipient_id TEXT, payload TEXT, byte_size INTEGER, received_at INTEGER, fetched_at INTEGER);
    CREATE TABLE message_events (seq INTEGER, msg_id TEXT, event TEXT, from_device TEXT, to_device TEXT, mode TEXT, status TEXT, hop_count INTEGER, detail TEXT, ts INTEGER);
    CREATE TABLE delivered_index (msg_id TEXT, recipient_agent_id TEXT, sender_agent_id TEXT, task_id TEXT, at INTEGER);
    CREATE TABLE would_deny_events (id INTEGER, msg_id TEXT, sender_agent TEXT, sender_owner TEXT, target TEXT, action TEXT, mode TEXT, reason TEXT, rule_snapshot TEXT, classification TEXT, processed INTEGER, classified_by TEXT, classified_at INTEGER, ts INTEGER);`)
  db.prepare('insert into recipients values (?,?,?,?,?,?,?,?,?,?)').run('r-1', 'yf-0001a2b3', 'master-pc', 'yufu-owner', 'avatar-client', '{}', now, now, 'u1', 'lome')
  db.prepare('insert into recipients values (?,?,?,?,?,?,?,?,?,?)').run('r-2', 'yf-0009ff01', 'ops-node', 'ops-pi-01', 'worker-client', '{}', now, now, 'u1', 'lome')
  db.prepare('insert into recipients values (?,?,?,?,?,?,?,?,?,?)').run('r-self', 'yf-self01', 'oh-my-pi', 'omp-ops-pi-01', 'worker-client', '{}', now, now, 'u1', 'lome')
  db.prepare('insert into recipients values (?,?,?,?,?,?,?,?,?,?)').run('r-other', 'yf-other-x', 'other-node', 'other-agent', 'mcp', '{}', now, now, 'u2', 'someone')
  // ① 回填身份入向 / ② 无回填入向 / ⑩ 别人的收件（不归属本实例 → 不搬）
  db.prepare('insert into messages (seq,id,recipient_id,payload,byte_size,received_at,fetched_at) values (?,?,?,?,?,?,?)')
    .run(1, 'msg-1', 'r-self', JSON.stringify({ from: { device: 'master-pc', name: 'yufu-owner', agentId: 'yf-0001a2b3', ownerUsername: 'lome', role: 'avatar' }, to: { target: 'ops-pi-01' }, mode: 'notify', taskId: 'OPSP-P2', text: '正文不该进事件' }), 128, now - 60000, null)
  db.prepare('insert into messages (seq,id,recipient_id,payload,byte_size,received_at,fetched_at) values (?,?,?,?,?,?,?)')
    .run(2, 'msg-2', 'r-self', JSON.stringify({ from: { device: 'legacy-node', name: 'old-agent', sessionID: 's1' }, mode: 'notify', text: 'legacy hello' }), 64, now - 30000, null)
  db.prepare('insert into messages (seq,id,recipient_id,payload,byte_size,received_at,fetched_at) values (?,?,?,?,?,?,?)')
    .run(3, 'msg-other', 'r-other', JSON.stringify({ from: { device: 'x', name: 'x', agentId: 'yf-0001a2b3', ownerUsername: 'lome', role: 'avatar' }, mode: 'notify', text: '别人的信' }), 32, now - 20000, null)
  // ③ delivered_index：入向（recipient=self）/ 出向（sender=self）/ 无关行
  db.prepare('insert into delivered_index values (?,?,?,?,?)').run('msg-d1', 'yf-self01', 'yf-0001a2b3', 'OPSP-P2', now - 20000)
  db.prepare('insert into delivered_index values (?,?,?,?,?)').run('msg-d2', 'yf-0009ff01', 'yf-self01', 'OPSP-P3', now - 15000)
  db.prepare('insert into delivered_index values (?,?,?,?,?)').run('msg-d3', 'yf-other-x', 'yf-other-y', 'OPSP-X', now - 10000)
  // ④ 词表内 / 词表外
  db.prepare('insert into would_deny_events (id,msg_id,sender_agent,sender_owner,target,action,mode,reason,ts) values (?,?,?,?,?,?,?,?,?)')
    .run(1, 'msg-denied', 'yf-0009ff01', 'lome', 'yf-self01', 'terminated', 'notify', 'agent 已由主人终止', now - 5000)
  db.prepare('insert into would_deny_events (id,msg_id,sender_agent,sender_owner,target,action,mode,reason,ts) values (?,?,?,?,?,?,?,?,?)')
    .run(2, 'msg-odd', 'yf-odd', 'lome', 'yf-self01', 'magic-action', 'notify', '词表外动作', now - 4000)
  // ⑥ 投递失败
  db.prepare('insert into message_events (seq,msg_id,event,from_device,to_device,mode,status,hop_count,detail,ts) values (?,?,?,?,?,?,?,?,?,?)')
    .run(1, 'msg-f1', 'deliver', 'master-pc', 'ops-node', 'mail', 'failed', 2, 'recipient offline', now - 3000)
  db.close()
  // ⑤ 治理执行事件（terminated 是拒绝；released 不是）。自身份首跑用 --self 显式指定（平台映射转写同路径）
  writeFileSync(join(yuyi, 'yuyi-agent', 'events.jsonl'), [
    JSON.stringify({ seq: 1, at: now - 8000, event: { kind: 'terminated', target: { agentId: 'yf-0009ff01', name: 'ops-pi-01' }, by: '主人', reason: '越权写路径' } }),
    JSON.stringify({ seq: 2, at: now - 7000, event: { kind: 'released', target: { agentId: 'yf-0009ff01', name: 'ops-pi-01' }, by: '主人', reason: '恢复' } }),
  ].join('\n') + '\n')

  const obs = join(T, 'obs')
  const tool = join(OBS_TOOL, 'yuyi-transcribe.mjs')
  const run = (extra = []) => g([tool, '--instance', 'omp-ops-pi-01', '--host-type', 'omp', '--system', 'ops-pi', '--obs', obs, '--yuyi', yuyi, '--state', join(T, 'state.json'), '--once', ...extra])
  run(['--self', 'yf-self01'])
  const eventsFile = () => { const d = join(obs, 'events', 'omp-ops-pi-01'); return readdirSync(d).map((f) => readFileSync(join(d, f), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))).flat() }
  const evs = eventsFile()
  const byType = (t) => evs.filter((e) => e.type === t)

  ok(byType('collab.message.received').length === 3, `入向消息转写 3 条（含 delivered_index 入向）：实际 ${byType('collab.message.received').length}`)
  ok(byType('collab.message.sent').length === 1, `出向消息转写 1 条：实际 ${byType('collab.message.sent').length}`)
  const m1 = evs.find((e) => e.subject === 'msg-1')
  ok(m1?.peerAgentId === 'yf-0001a2b3' && m1?.peerOwner === 'lome' && m1?.peerRole === 'avatar', '① Hub 回填三元组整体在位')
  const m2 = evs.find((e) => e.subject === 'msg-2')
  ok(m2 && !('peerAgentId' in m2) && !('peerOwner' in m2) && !('peerRole' in m2), '② 无回填 → 身份字段整体缺席（诚实降级）')
  const d2 = evs.find((e) => e.subject === 'msg-d2')
  ok(d2?.direction === 'outbound' && d2?.peerAgentId === 'yf-0009ff01' && d2?.peerOwner === 'lome', '③ 出向投递按自身份判方向并对端身份来自 Hub 目录')
  ok(!evs.some((e) => e.subject === 'msg-d3'), '无关投递不搬（Hub 全局库只取与自身相关行）')
  ok(!evs.some((e) => e.subject === 'msg-other'), '⑩ 别人的收件不搬（recipients 归属过滤）')
  const denials = byType('collab.gate-denied')
  ok(denials.length === 2, `闸门拒绝 2 条（词表内 + events.jsonl terminated）：实际 ${denials.length}`)
  ok(denials.every((d) => d.decision !== 'magic-action') && !evs.some((e) => e.subject === 'msg-odd'), '④ 词表外 action 跳过不编造')
  ok(!denials.some((d) => d.reason.includes('恢复')), '⑤ released 非拒绝不转写')
  const failEv = byType('collab.message.delivery-failed')
  ok(failEv.length === 1 && failEv[0].severity === 'warning' && failEv[0].deliveryStatus === 'failed', '⑥ 投递失败转写为 warning')
  ok(!evs.some((e) => e.direction === undefined) && evs.every((e) => ['inbound', 'outbound'].includes(e.direction)), '所有 collab 事件带 direction（契约硬规则）')
  ok(!evs.some((e) => JSON.stringify(e).includes('正文不该进事件') || JSON.stringify(e).includes('legacy hello') || 'text' in e), '⑧ 隐私：正文 text 不进任何事件')
  ok(!evs.some((e) => 'peerOwner' in e && !('peerAgentId' in e)), '契约负规则：无「peerOwner 在位而 peerAgentId 缺席」')

  // ⑦ 幂等 + agent.json 自身份回退路径（同一身份 → 检查点去重为零）
  writeFileSync(join(yuyi, 'agent.json'), JSON.stringify({ default: 'self', agents: { self: { agent_id: 'yf-self01', yufu_url: 'http://127.0.0.1:1' } }, hub: 'wss://hub' }))
  run()
  ok(eventsFile().length === evs.length, '⑦ 重复运行检查点去重（零重复事件）')

  // ⑨ 契约校验
  let vOk = false
  const evFiles = readdirSync(join(obs, 'events', 'omp-ops-pi-01')).map((f) => join(obs, 'events', 'omp-ops-pi-01', f))
  try { execFileSync('node', [join(OBS_TOOL, 'contracts', 'validate.mjs'), ...evFiles], { stdio: 'pipe' }); vOk = true } catch { /* 校验失败 */ }
  ok(vOk, '⑨ 全部事件过契约 v1 校验（validate.mjs PASS）')
  completed = true
} finally {
  try { rmSync(T, { recursive: true, force: true }) } catch { /* 留给系统清理 */ }
  if (!completed || fails.length) { console.error(`\n[yuyi-transcribe-e2e] FAIL：${fails.length || '夹具构建中断'} 项未过`); process.exit(1) }
  console.log('\n[yuyi-transcribe-e2e] PASS：协作转写验收全过（夹具隔离，无生产副作用）')
}
