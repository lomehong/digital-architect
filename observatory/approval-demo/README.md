# approval-request-v1 — 参考实现演示

> 完整说明：`contracts/approval-request-v1.md`（文件请求/应答协议、事件契约、失败模式）。
> 本目录是**一次性脚本**（不是守护进程），用于演示契约端到端跑通 + 给 ops-pi P3 实现做模板。

## 一键演示

```powershell
# 1. 启动 observatory 常驻服务（如未在跑）
Start-ScheduledTask -TaskName "ArchitectObservatory"

# 2. 在新窗口跑参考实例（写 pending + 等决定）
cd E:\Development\Code\nodejs\digital-architect
node observatory/approval-demo/instance.mjs

# 3. 浏览器打开 http://127.0.0.1:8787 → 切到「治理操作」视图 → 看到 pending 列表 → 点批准/拒绝
#    4. 终端回显「收到决定：allow by 主人」 + 自动清理 pending
```

## 实际场景接入（ops-pi P3 模板）

```js
// 在 ops-pi 的高危工具 execute 函数中（要 Owner 批准才放行的）：
import { writeFileSync, appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

const REQ = 'req-' + randomUUID()
const OBS = process.env.OBS_ROOT
const PENDING = join(OBS, 'approvals/pending', `${REQ}.json`)
const DECISION = join(OBS, 'approvals/decisions', `${REQ}.json`)

mkdirSync(join(OBS, 'approvals/pending'), { recursive: true })
writeFileSync(PENDING, JSON.stringify({
  requestId: REQ, ts: new Date().toISOString(), instanceId: process.env.INSTANCE_ID,
  subject: { tool: 'ops_ssh_exec', params: { host: 'prod-db', command: '...' } },
  reason: '高危敏感操作', requiredBy: new Date(Date.now() + 5*60*1000).toISOString(),
  callbacks: { decisionFile: DECISION },
}))

appendFileSync(join(OBS, 'events', INSTANCE_ID, new Date().toISOString().slice(0,10)+'.ndjson'),
  JSON.stringify({ ts:new Date().toISOString(), instanceId:INSTANCE_ID, hostType:'omp', system:'ops-pi', domain:'runtime', type:'approval.requested', severity:'info', subject:REQ, payload:{ tool:'ops_ssh_exec' }})+'\n')

// 轮询决定（后台守护）
const start = Date.now()
while (Date.now() - start < 5*60*1000) {
  if (existsSync(DECISION)) {
    const d = JSON.parse(readFileSync(DECISION, 'utf8'))
    if (d.decision === 'allow') { /* 执行 */ } else { /* 拒绝 */ }
    unlinkSync(PENDING); break
  }
  await new Promise(r => setTimeout(r, 1500))
}
```
