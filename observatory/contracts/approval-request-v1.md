# contracts/approval-request-v1.md — Architect Observatory 审批代办契约 v1

> **目的**：各宿主（dsh / omp / 未来）将 pending approval 请求报到 Observatory；本平台在治理视图呈现，主人在平台批准/拒绝；实例读取决定并执行。**决定权始终在主人**，平台与实例只搬动事实。
> **场景**：omp 会话在 yolo+非交互下不可用（O4 硬失败）；交互态依赖主人/Owner 批准。**未来** ops-pi P3 实施时，高危批准令牌（`policy.token`）流程也走本契约。
> **承载**：与事件契约 v1 一致的**文件约定**——零新依赖、git 友好、实例崩溃不丢请求。

## 一、参与方

- **实例**（发起方）：宿主上跑的任何架构师 Agent 实例（omp / dsh 适配器 / 未来）
- **主人**（决定方）：人在 Observatory 治理视图前
- **平台**（承载方）：`observatory/server.mjs`

## 二、生命周期

```
实例  ──┐                                            ┌──→ 实例
        │  写 pending + 发事件                       │
        ├──→  obs/approvals/pending/<id>.json ──→ 平台
        │     obs/events/<inst>/<date>.ndjson:        │
        │     type=approval.requested                 │
        │                                            │
        │   平台 ──→ 看板/治理视图呈现                │
        │                                            │
        │   主人在平台 confirm|reject                  │
        │                                            │
        │   平台 写 decision + 发事件                  │
        │     obs/approvals/decisions/<id>.json        │
        │     obs/events/<inst>/<date>.ndjson:        │
        │     type=approval.resolved                   │
        │                                            │
        └── 实例轮询 decisions/<id>.json 读到 ←───────┘
```

## 三、文件契约

### 3.1 请求文件 `obs/approvals/pending/<request-id>.json`

```json
{
  "requestId": "req-<uuid>",
  "ts": "2026-09-12T11:00:00Z",
  "instanceId": "omp-ops-pi-01",
  "subject": {
    "tool": "ops_ssh_exec",
    "params": { "host": "prod-db", "command": "..." }
  },
  "reason": "需要 Owner 批准（yolo+非交互下需确认）",
  "requiredBy": "2026-09-12T11:30:00Z",   // 超时自动作废
  "callbacks": {
    "decisionFile": "obs/approvals/decisions/req-<uuid>.json"   // 实例轮询该文件
  },
  "context": {
    "sessionId": "...",
    "traceId": "..."
  }
}
```

### 3.2 决定文件 `obs/approvals/decisions/<request-id>.json`

```json
{
  "requestId": "req-<uuid>",
  "ts": "2026-09-12T11:05:00Z",
  "decision": "allow",       // "allow" | "deny"
  "by": "主人",
  "via": "observatory",
  "reason": "正常维护"
}
```

### 3.3 文件命名

- `requestId` = `req-<uuid>`（实例生成的稳定 id，跨文件关联）
- 路径确定：`obs/approvals/pending/req-<uuid>.json` / `obs/approvals/decisions/req-<uuid>.json`
- **idempotent**：同一 requestId 的决定文件后写覆盖前写（平台 retry 安全）

## 四、事件契约（接事件契约 v1 envelope）

```json
{ "ts": "...", "instanceId": "...", "hostType": "...", "system": "...",
  "domain": "runtime", "type": "approval.requested|approval.resolved",
  "severity": "info|warning|critical",
  "subject": "req-<uuid>",
  "payload": { "tool": "...", "decision": "allow|deny", "by": "主人" } }
```

## 五、平台行为

1. **发现**：watch `obs/approvals/pending/`（fs.watch）——新文件出现即在治理视图呈现
2. **轮询降级**：每 5s 全量扫 pending 目录（fs.watch 漏报兜底）
3. **超时**：当前时间 > requiredBy → 自动在决定文件写 `decision: "deny"`, `by: "system-timeout"`, 发 `approval.resolved` 事件；保留 pending 文件供事后审计
4. **取消**：实例可在 pending 文件中写 `cancelled: true` 撤回请求；平台检测后不呈现
5. **重复**（同 requestId 多次写 pending）：覆盖更新（last-write-wins），但 ts 取首次；已发事件不重发
6. **操作面板**（`observatory/public/index.html` 治理视图）：每条 pending 显示「批准/拒绝」按钮 → 平台写决定文件 + 发事件
7. **决定事件审计**：平台治理操作自身发 `governance.*` 事件（已与 task-ledger 治理审计同构）

## 六、实例读取契约

实例后台轮询器：
- 扫描 `obs/approvals/decisions/<instanceId>/`（按 instanceId 分目录隔离——多实例互不干扰）
- 发现匹配 requestId 的决定文件 → 加载 → 行为化 `decision` → 删除已处理的决定文件
- 扫描 `obs/approvals/pending/<instanceId>/` 找超时未决的请求 → 可选：主动 cancel 或 escalate

## 七、失败模式

- 实例崩溃前未读到决定 → pending 文件保留；超时由平台自动 deny（持久语义）
- 决定文件损坏 / 解析失败 → 实例上报 `approval.resolved` 携带 `decision: "deny"` 与 reason（视为保守失败）
- 平台故障（observatory 未运行）→ pending 文件仍存；实例看不到决定可主动 cancel 或升级（决定事件缺失时上报 critical）

## 八、为什么用文件承载（不直接走事件契约或 HTTP）

- **零新依赖**：与 obs/events 同哲学——git/文本/手动都可读
- **持久**：实例/平台重启不丢请求（事件 NDJSON 仍在，但决定状态独立文件更稳）
- **请求/决定解耦**：请求与决定时间窗可能跨长时间（主人不在）；文件是天然状态机快照
- **可在低权限进程间传递**：实例与平台可能用不同用户身份（dsh 用户 / pi 用户），文件 ACL 即可隔离
