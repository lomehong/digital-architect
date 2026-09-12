# Architect Observatory — 架构师 Agent 团队可观测性平面

> 设计文档：`docs/design/observatory-architecture-design.md`（v4.3 已落定）
> 定位：为架构师 Agent **团队**（多实例 × 多宿主 × 多系统，含共管）提供统一可观测性与治理操作面。
> **平台是主人的操作界面**——所有确认/审批的决定权在主人，平台只负责呈现与执行（不旁路任何既有机制）。

## 快速开始

```powershell
# 启动（计划任务，登录自启；首次注册见「部署」）
Start-ScheduledTask -TaskName "ArchitectObservatory"

# 访问看板
start http://127.0.0.1:8787

# 停止（精确，按 pid 文件）
Stop-ScheduledTask -TaskName "ArchitectObservatory"
# 若需强杀：先读 observatory\server.pid 核对命令行含 server.mjs，再 Stop-Process -Id <pid>
```

## 六个视图

| 视图 | 内容 |
|---|---|
| **团队总览** | 实例列表（御符/宿主/负责系统/心跳）· 告警区（含抑制状态）· 健康信息 · 审批挂单 · 治理留痕 |
| **系统视图** | 按「被负责系统」聚合：负责实例 + 任务四态看板 |
| **实例视图** | 单实例事件流（最近 15 条）+ 心跳详情 |
| **知识视图** | 评审队列明细 · 知识域事件 · 知识治理留痕 |
| **运行时** | omp agent.db 只读摄取：按模型的样本数 / 输出 tokens / 平均生成耗时 / 平均 TTFT |
| **事件流** | 全实例事件实时流（最近 60 条，按实例筛选，10s 自动刷新） |
| **治理操作** | 任务 confirm/reject · 知识条目升级 · （审批挂单在团队总览呈现） |

## 三类治理操作（决定权在主人）

| 操作 | 端点 | 执行机制（均不旁路） |
|---|---|---|
| 任务 confirm / reject | `POST /api/govern/task` | 调 `task-ledger.mjs` CLI，四不变量（状态机/来源必填/留痕/归档）由 ledger 强制 |
| 知识条目升级（待审核→已确认） | `POST /api/govern/knowledge` | 修订条目 frontmatter status + 发 governance 审计事件 |
| 审批代办 approve / deny | `POST /api/govern/approval` | 写决定文件 + 发 `approval.resolved` 事件 + 清理挂单 |

**审计**：三类操作均发 `governance.*` 事件，落到 `obs/events/`。

## API

| 端点 | 说明 |
|---|---|
| `GET /api/snapshot` | 全量快照（实例/事件/任务/告警/挂单/运行时/治理） |
| `GET /api/health` | 健康与数据源探测（pid/uptime/各源 ok·error/告警规则数） |
| `GET /api/runtime` | 模型性能统计（agent.db 只读） |
| `GET /api/events?limit=&instanceId=` | 事件流（增量读取用） |
| `GET /api/alerts-history` | 告警历史（最近 100 条，落 `obs/alerts-history.ndjson`） |
| `GET /api/archive` | 审计归档状态（封印条数 / 链完整性 / 最近封印） |
| `POST /api/events` | **HTTP 上报端点**（契约校验后 append 到 `obs/events/http/`） |

## 审计归档（不可变审计，RR-2 闭环）

事件流是人类可读的追加文件；**哈希链封印**为其提供防篡改证据：

```powershell
# 封印（闭日严格；当日需显式 --include-today 作检查点）
node observatory/seal.mjs                  # 封印所有已结束日期
node observatory/seal.mjs --include-today  # 额外为当日打检查点

# 校验（exit 0 = 通过）
node observatory/seal.mjs --verify
```

**语义**：封印记录写入 `obs/archive/seals.ndjson`（只增不改），每条含 `sha256`（当日全部事件文件的路径+内容依序摘要）、`prevSha`/`chainSha`（哈希链）。
- **闭日封印**（封印时该日已结束）：内容**严格**必须一致 → 任何改动 = FAIL
- **当日检查点**：允许增长（事件仍在写入）；**删除/截断**（字节数缩水）→ FAIL
- 链完整性：`prevSha` 与上一条 `chainSha` 必须吻合，否则说明封印记录被改
- 快照清单：每次封印落 `obs/archive/snapshot-<ts>/manifest.json`

**实测**（2026-09-12）：篡改已封印文件 → `--verify` FAIL 并指出内容与封印不符；复原 → PASS；链断裂/内容删除同样可检出。

## 数据契约

| 契约 | 文件 | 说明 |
|---|---|---|
| 事件契约 v1 | `contracts/validate.mjs` | NDJSON 信封：`ts/instanceId/hostType/system/domain/type/severity`；域枚举 8 类；校验器可独立跑：`node contracts/validate.mjs <file.ndjson>` |
| 审批代办契约 v1 | `contracts/approval-request-v1.md` | 文件请求/应答协议（pending → decisions）+ 事件对 |
| 参考实现 | `approval-demo/instance.mjs` | 一次性演示：写 pending → 等决定 → 收到后行动（ops-pi P3 模板） |

## 实例接入

**注册**（`obs/instances/<御符id>.yaml`，心跳 = 周期重写 `lastSeenAt`）：

```yaml
instanceId: omp-ops-pi-01
hostType: omp            # dsh | omp | 未来
host: oh-my-pi 容器
systems: [ops-pi]        # 负责系统（多值支持共管）
capabilities: [prd-digest, design, review, implement, knowledge-distill]
status: online
lastSeenAt: 2026-09-12T07:00:00Z
heartbeatIntervalSec: 30
```

**上报**（选一）：
- **文件约定**（默认）：append `obs/events/<instanceId>/<yyyy-mm-dd>.ndjson`
- **HTTP**：`POST /api/events`（单条或 `{events: [...]}`）

**omp 容器**：`entrypoint.sh` 已内置心跳循环（`OBS_ROOT` 挂载即可，见 `docker/docker-compose.yml` 的 `../obs:/opt/architect/obs:rw`）。
**dsh 侧**：直接写宿主 `obs/`。

## 部署与运维

```powershell
# 计划任务注册（登录自启）
$node = (Get-Command node).Source
$srv  = "E:\Development\Code\nodejs\digital-architect\observatory\server.mjs"
$action  = New-ScheduledTaskAction -Execute $node -Argument "`"$srv`" --tasks `"E:\Development\Code\nodejs\ops-pi\docs\tasks`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName "ArchitectObservatory" -Action $action -Trigger $trigger -RunLevel Limited -Force
```

**启动参数**：`--port <n>`（默认 8787）· `--tasks <dir>`（可重复，台账目录）· `--agentdb <path>` · `--alert-cooldown-ms <n>`

**进程管理纪律（重要）**：只按 `server.pid` 登记精确启停；**禁止** `Get-Process node | Stop-Process`（会杀掉宿主进程树，见 `architect-knowledge/practice/suite-build-lessons.md`）。

**排障**：`GET /api/health` 看数据源探测；服务起不来时核对 8787 占用者的命令行；`obs/` 为追加数据，删除即回退。

## 目录结构

```
observatory/
├── server.mjs                 平台服务（零 npm 依赖，仅 node: 内置模块）
├── seal.mjs                   审计归档封印与校验（哈希链）
├── alert-rules.yml            告警规则 v1（5 条，支持抑制窗口）
├── public/index.html          看板单页（原生 JS，无构建）
├── contracts/                 事件契约校验器 + 审批代办契约
├── approval-demo/             审批参考实现 + 说明
└── server.pid                 运行中实例 PID（gitignore）
obs/                           运行时数据根（gitignore）
├── instances/                 实例注册与心跳
├── events/<instanceId>/       事件流 NDJSON（按实例分文件，无并发竞争）
├── events/http/               HTTP 上报落点
├── approvals/{pending,decisions}/
├── archive/                   封印链（seals.ndjson）+ 快照清单
└── alerts-history.ndjson      告警历史
```

## 分期状态

- **一期 ✅**：契约 v1 + 校验器 + 实例注册/心跳 + 看板四视图 + omp 实例接入 + 任务治理 confirm + 双实例冒烟
- **二期 ✅（部分）**：运行时层（agent.db 只读摄取）· HTTP 上报端点 · 告警规则 + 抑制 + 历史 · 健康端点 · 知识视图增强 · 事件实时流 · **审批代办端到端**（含参考实现）
- **二期剩余**：御驿消息结构化（依赖 Yuyi 身份接口 B1 交付）
- **三期 ✅（部分）**：**不可变审计归档（哈希链封印 + 校验，RR-2 闭环）** 已完成并篡改检测实测
- **三期剩余**：御符强验证（Yufu 对接）· 跨实例统一治理（现可按 `--root` 治理任一实例，待形式化）
