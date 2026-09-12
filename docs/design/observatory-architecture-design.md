# 可执行技术方案：Architect Observatory — 架构师 Agent 团队可观测性平面

```yaml
---
title: Architect Observatory — 架构师 Agent 团队可观测性平面
status: 已落定          # 主人 2026-09-12 确认（治理面自举：本确认即平台首个治理对象）
requirement: 主人 2026-09-12 口述需求 + 四项拍板（边界/承载/身份/治理面）
author: 架构师会话（dsh 侧）
created: 2026-09-12
review:

  conclusion: 通过（主人 2026-09-12 确认；治理面自举对象）
---
```

## 0. 一句话与五问速答

**一句话**：为架构师 Agent 团队（多实例 × 多宿主 × 多系统，含共管）建统一可观测性平面——实例注册发现 + 统一生命周期事件契约 + 可视化看板 + 治理操作面（confirm/审批经平台执行，确认权始终在主人）。

| 五问 | 速答 |
|---|---|
| 改哪里？ | digital-architect 总仓新增 `observatory/`（平台服务+前端+契约）与 `obs/`（运行时数据根，gitignore）；omp 容器白名单挂载扩展 |
| 为什么改？ | 生命周期数据散落在 yaml/db/会话/报告中，团队化后无统一视图无法治理；且承接设计 RR-2 遗留（跨会话不可变审计的外部系统） |
| 影响谁？ | 新增自包含服务；omp 容器加一个 rw 挂载（obs 上报）；不改动 dsh-architect/omp-architect/task-ledger 任何既有代码——ledger 经 CLI 复用 |
| 如何验证？ | 事件契约校验器 + 实例注册/心跳/任务 confirm 的端到端冒烟 + 双实例（omp 容器 + dsh 侧模拟实例）并跑 |
| 还有什么没确认？ | 御符体系与实例身份的强绑定（一期字符串自报、后期接 Yufu 验证）；omp-stats 集成时机（二期） |

## 1. 需求覆盖

**Do**：实例注册与发现（御符身份+心跳）；统一生命周期事件契约 v1（文件约定起步，HTTP 预留）；四维看板（团队/系统/实例/知识）；治理操作面（任务 confirm/reject、知识条目升级——经 task-ledger CLI 执行，四不变量由既有机制强制）。
**Don't**：不做指标时序库/告警引擎（二期）；不重造 omp-stats 的用量统计（二期评估集成）；不自动执行任何确认（治理操作必须主人点击）；不改 task-ledger/ops_audit 既有格式。
**To Confirm**：御符与实例的强绑定验证（一期字符串自报）；平台部署位置的最终确认（一期=dsh 侧宿主进程）。

## 2. 系统覆盖

| 组件 | 变更 | 说明 |
|---|---|---|
| `observatory/`（总仓） | 增 | server.mjs（零 npm 依赖 Node 服务）、public/index.html（看板）、contracts/（事件 schema v1） |
| `obs/`（总仓，gitignore） | 增 | 运行时数据根：instances/（注册+心跳）、events/（NDJSON 事件流） |
| omp 容器 | 白名单+1 | `../obs:/opt/architect/obs:rw`（omp 实例上报通道）；Dockerfile 不动 |
| dsh 实例 | 白名单+0 | dsh 侧实例直接写宿主 `obs/` |
| task-ledger.mjs | **不动** | 治理操作经 CLI 复用（单一事实源，四不变量不旁路） |
| 既有知识库/设计文档 | 只读读取 | 看板数据源 |

## 3. 证据覆盖

- 事件契约字段设计依据：task-ledger events[] 结构（op/ts/by）、ops_audit 字段（tool/toolCallId/isError/authz）、review-queue 结构（2026-09-12 实读）
- 御符身份：dsh-architect `15183e2`（独立 preset id 实例，御符按实例注入）+ ops-pi §7.6（B1 身份判定）
- gh/omp-stats 能力：omp README Monorepo Packages 表（2026-09-12 实读）

## 4. 风险覆盖

| 风险 | 对策 |
|---|---|
| 事件文件并发写（多实例同文件） | 按 instanceId 分目录——单实例单文件追加，跨实例无竞争 |
| 事件丢失（实例宕机未 flush） | 逐条写+flush；NDJSON 容忍尾部残行（解析跳过） |
| 治理操作误触 | confirm 需二次确认（前端）+ 操作经 ledger 不变量强制（状态机/来源必填）+ 平台自身发治理审计事件 |
| obs/ 无限增长 | 按日期滚动文件；二期加保留策略（归档至 artifacts） |
| 私有数据暴露（看板含密钥场景） | 看板只读元数据与状态；绑定 127.0.0.1；不做公网暴露 |

## 5. 验证覆盖

| 手段 | 内容 |
|---|---|
| Contract | 事件契约校验器（observatory/contracts/validate.mjs）：对 NDJSON 逐行断言必填字段/枚举/时间戳 |
| Unit | server 的聚合逻辑（实例心跳超时判定、任务聚合）用 node:test |
| 端到端冒烟 | 模拟实例写注册+事件 → 平台看板 API 返回聚合 → 治理 confirm → ledger yaml 状态变化 + 平台审计事件出现 |
| 契约负测 | 故意违例（collab 缺 direction / 半可信身份 / 非法 role / gate-denied 缺 reason）逐条 FAIL；HTTP 摄入**混批**精确计数 accepted/rejected（历史混批漏收 bug 的回归） |
| 渲染烟测 | `contracts/render-smoke.mjs`：node:vm + 最小 DOM stub 真实执行 `render()`，8 视图断言关键内容在位、无 `undefined`/`NaN` 泄漏、空态降级正常（无需浏览器） |
| 数据根隔离 | `--data` 临时数据根起第二实例：PID 登记互不覆盖、总仓知识库/告警规则仍按 `--root` 读取 |
| 双实例并跑 | omp 容器实例（经挂载写）+ dsh 模拟实例（宿主直写）同时上报，聚合无串扰 |
| Rollback | 停服务即回原状（obs/ 为追加数据，删除即回退）；不改任何既有系统 |

## 6. 不确定性治理

| # | 类型 | 项 | 处置 |
|---|---|---|---|
| 1 | Unknown → **已解除** | 御符强验证（Yufu 体系对接） | 2026-09-12 源码核实：Hub 权威回填 + `yufu_*` 查询面 + agent-daemon 闸门三条受支持接口**已存在**（§7.2.1），跨团队请求撤销。平台不做身份验证、不接入御符内部 API（Yuyi 插件自治）；改为**实例自验 + 证据上报**（§7.1 身份三态） |
| 2 | Unknown → **已评估** | omp-stats 集成形态 | 结论：**不集成 `omp stats` CLI**，保持零依赖只读摄取 agent.db（同源结构化数据，无进程/输出格式耦合）。取证（2026-09-12 实读本机 agent.db）：`model_perf`/`model_usage` **已用**（3 模型）、`client_usage`（含 `cost_usd` 成本列，**0 行**）、`usage_history`（**0 行**）、`command_usage`（3 行）；成本/趋势视图待数据积累后再评估 |
| 3 | Human Decision（已决） | 边界/承载/身份/治理面 | 主人 2026-09-12 四项拍板（本文档即据此设计） |

## 7. 架构设计

### 7.1 实例注册与身份（御符）

```yaml
# obs/instances/<instanceId>.yaml   # instanceId = 御符 id（一期字符串自报）
instanceId: omp-ops-pi-01           # 建议 <宿主>-<职责>-<序号>
hostType: omp                       # dsh | omp | <未来>
host: oh-my-pi 容器（TARGET_PROJECT=ops-pi）
systems: [ops-pi]                   # 负责的系统清单（多值，可共管）
capabilities: [prd-digest, design, review, implement, knowledge-distill]
status: online                      # online | offline
lastSeenAt: 2026-09-12T10:00:00Z
heartbeatIntervalSec: 60
```

心跳 = 实例定期更新 lastSeenAt（重写本文件）。平台判定：`now - lastSeenAt > 3×interval` → offline（可发现降级，N-3 同哲学）。

**身份语义（诚实分级，不夸大）**——`instanceId` 的取值来源分三态，平台如实标注来源，绝不以弱证据冒充强证据：

| 态 | 含义 | 事件/字段 | 平台行为 |
|---|---|---|---|
| 自报 | 实例自己声明的 id（一期形态） | 注册文件 `instanceId` | 呈现，标注「自报」 |
| 回填 | 跨实例消息中的**对端**身份由 Yuyi Hub 权威回填（客户端不可自报，§7.2.1） | `collab.message` 的 `peerAgentId/peerOwner/peerRole` | 呈现并标「Hub 回填」 |
| 自验 | 实例用 `yufu_verify`（`POST /api/v1/auth/agent/verify`）验证自身 token 后上报验证证据 | `platform.identity.verified` | 呈现并标「已验证 / 失效」 |

平台**不**接入御符内部 API、不持有御符管理凭证——验证在实例侧完成，平台只存档证据（与「Yuyi 身份插件自治，观测面不接管身份」一致）。

### 7.2 统一生命周期事件契约 v1（NDJSON，append-only）

```
obs/events/<instanceId>/<yyyy-mm-dd>.ndjson
```

每行一个事件（信封必填：`ts / instanceId / hostType / system / domain / type / severity`；可选：`subject / payload / traceId`）：

| domain | type（一期枚举） | payload 要点 |
|---|---|---|
| task | state.changed | taskId, from, to, by, via(observatory/ledger/cli), reason |
| task | created / claimed / reported | taskId, by, acceptCount |
| design | status.changed | doc, from, to, reviewScore |
| review | completed | doc, score, conclusion, gaps[] |
| runtime | session.started / ended | sessionId, model, costTokens, costCny |
| runtime | tool.called / tool.denied | tool, authz(preauth/deny/…), reasonClass |
| runtime | approval.requested / resolved | subject, decision |
| knowledge | status.changed | entry, from, to |
| collab | message.received / message.sent | direction, peerAgentId, peerOwner, peerRole, peerName, peerDevice, mode, taskId, replyTo（御驿消息结构化，见 §7.2.1） |
| collab | gate-denied | subject, decision, reason（治理执行证据：终止/屏蔽在注入/回信侧生效） |
| governance | confirmed / rejected | subject, by=主人, via=observatory |
| platform | instance.online / offline / heartbeat.missed | instanceId |

severity: `info | warning | critical`。**校验器**：`observatory/contracts/validate.mjs <ndjson>`（CI 与平台摄入共用）。

#### 7.2.1 御驿消息结构化契约（二期；原阻断项 B1 已解除）

**背景**：原状态为「依赖 Yuyi 身份接口交付（跨团队阻断 B1）」。2026-09-12 源码核实结论——**无需新接口，受支持接口已存在**，跨团队请求撤销；设计随之从「等接口」改为「按既有契约转写」。

| 面 | 受支持接口（证据回源） |
|---|---|
| 对端身份 | Hub 权威回填 `YuyiSender.agentId / ownerUsername / role`：出站**剥离**客户端自报字段，投递时以 `authority.sender` 回填（`Yuyi/packages/protocol/protocol.ts`：`HubAuthorityStamp` 注「客户端不得自报」；`encodeWire` 剥离；投递 `from: { ...route.from, ...authority?.sender }`） |
| 本方身份 | 实例本地持有 `bridge.agentId`（御符 id，`adapters/pi/yuyi-pi-extension.ts`）；查询面 `yufu_whoami`（含权限列表）/ `yufu_agent_get`（`packages/core/tools.ts`，权限守卫 `yufu:*`） |
| 治理执行 | `@qianji/agent-daemon` 闸门 `evaluateGate`：终止/屏蔽 → 注入与回信**双侧拒绝**；闸门不可达且严格模式（`YUYI_AGENT_GATE_STRICT`）→ 保守拒绝（`Yuyi/packages/agent/src/gate.ts` + `client.ts`） |

**转写规则（实例只转写，不判定、不补全身份）**：
- `peerAgentId ← from.agentId`、`peerOwner ← from.ownerUsername`、`peerRole ← from.role`（avatar/worker/coder/未设置）
- 老 Hub 不回填 → **身份三元组整体缺席**，不得用 peerName/peerDevice 冒充；平台如实显示「身份未验证」
- 平台**不连 Hub、不查御符内部 API、不推测身份**——与「Yuyi 身份插件自治、观测面不接管身份」的指示一致

**契约约束（`contracts/validate.mjs` 与 `POST /api/events` 摄入同源强制）**：`collab.message.*` 必带 `direction`(inbound|outbound)；`peerRole` 限枚举；`peerOwner` 在位而 `peerAgentId` 缺席 → FAIL（禁半可信身份）；`collab.gate-denied` 必带 `decision` 与 `reason`。

**平台呈现**：「协作」视图——对端清单（御符 id / Owner / 角色 / 流向计数 / 身份来源标注）+ 闸门拒绝证据 + 最近消息事件。
**参考实现**：`observatory/collab-demo/instance.mjs`（四类转写 + 闸门拒绝；主平台注入为契约活样例）。

### 7.3 平台服务（observatory/server.mjs，零 npm 依赖）

- **数据面**：`fs.watch` obs/ 递归监听 + **快照现读**（`/api/snapshot` 每次重新加载各数据源：事件流/台账/评审队列/设计文档 status/协作面），聚合为内存模型；`GET /api/snapshot` 全量快照、`GET /api/events?since=` 增量。
- **治理面**：`POST /api/govern/task|knowledge|approval` → 服务端**调用 task-ledger.mjs CLI**（`--confirmed-via observatory`）——四不变量由 ledger 强制，平台不旁路；治理动作自身发 `governance.*` 事件。
- **前端**：`public/index.html` 单页（原生 JS，无构建）：团队总览 / 系统视图 / 实例视图 / **协作** / 知识视图 / 治理操作 / 运行时 / 事件流。绑定 `127.0.0.1:8787`。
- **启动参数**：`--root <总仓根>`（知识库/告警规则/缺省 tasks 与 agent.db）、`--data <数据根>`（instances/events/approvals/archive，缺省 `<root>/obs`）、`--port`、`--tasks <dir>`（可重复）、`--agentdb`、`--alert-cooldown-ms`。`--data` 独立于 `--root`，便于在临时数据根上做无副作用端到端验证。
- **进程登记**：PID 写入 **`<数据根>/server.pid`**（非脚本目录）——多实例/临时数据根并存时互不覆盖；停启只按该登记精确操作（禁按进程名批量杀）。
- **降级**：某实例事件缺失 → 实例视图标 stale（数据即状态，不虚构）；协作面身份未回填 → 显式「未验证」。
- **回归资产**：`contracts/validate.mjs`（契约）、`contracts/render-smoke.mjs`（8 视图无浏览器渲染烟测 + 空态降级）、`approval-demo/`、`collab-demo/`、`identity-demo/`（契约参考实现，仅在隔离数据根注入）。
- **与 `omp stats` 的关系（评估结论）**：**不集成**该 CLI——它读的是同一 `agent.db`，本平台直接只读摄取是同源且无进程/输出格式耦合的路径；`omp` 升级不影响观测面。

### 7.4 治理操作面（贯穿主线）与分期

**治理面原则**：平台是主人的操作界面——所有确认/审批的**决定权在主人**，平台负责把「待治理事项」呈现到面前、把主人的决定**安全地执行到对应机制**（不旁路：任务经 task-ledger CLI、文档经 status 字段修订、知识经 status 升级——各自的不变量由既有机制强制），并**全量发 governance.* 审计事件**。

**治理操作可信性防线**（2026-09-12 完成加固；起因：本会话两次在负测中误对生产台账执行 confirm，均已回滚并留痕）：

| 防线 | 规则 | 目的 |
|---|---|---|
| **操作者显式** | 治理端点（task/knowledge/approval）**必须**显式提供 `by`；平台**不代填「主人」**（服务端函数层纵深同样拒绝空 by） | confirm 只能由主人发起——平台不得替主人署名 |
| **真实台账确认** | `root` 命中治理地址簿（`data-roots.yml`）即视为生产台账：脚本/自动化调用必须显式带 `confirmReal=true`；看板人工操作经二次确认后自动携带 | 阻断自动化与负测误写生产台账（本次事故直接成因） |
| **负测隔离** | 治理类**合法写路径**的端到端测试一律指向 `observatory/test-fixtures/fake-ledger`；生产台账只允许测拒绝路径 | 测试不得有生产副作用 |
| **回滚留痕** | 误操作以追加 `rollback` 事件更正，不抹除历史 | 审计链完整，错误可复盘 |

> 残余风险（登记）：平台绑定 127.0.0.1 且**无认证**——防线防的是「自动化/负测误写」，不防本机恶意进程。真正的身份认证需引入本地令牌或复用御符身份，列为后续加固项。

**治理对象全景（按域）**：

| 域 | 治理操作 | 执行机制（不旁路） |
|---|---|---|
| 任务 | confirm / reject（四态状态机的主人环节） | task-ledger.mjs CLI（--confirmed-via observatory） |
| 设计/方案 | 文档落定确认（status: 待确认 → 已落定 + confirmedBy/confirmedVia 记录） | 文档 status 字段修订（**首个治理对象 = 本设计文档自身，自举**） |
| 知识 | 条目升级（待审核 → 已确认）、驳回 | 条目 status 字段 + review-queue 处理 |
| 评审队列 | review-queue.yaml 条目的确认/处置 | review-queue 修订 |
| 运行时审批 | omp/各实例会话的 pending approval（工具审批请求）上屏，主人批准/拒绝 | **文件请求/应答协议**（与事件契约同哲学）：实例发 approval.requested 事件 + 轮询应答文件；二期实现 |
| 跨 Agent 权限 | 跨 Agent 写路径/权限开放的逐项确认 | 权限清单文件修订（P3 形态预授权）；身份由 Yuyi 插件自治，本平台不接管（§7.2.1） |

**分期（治理操作作为主线贯穿三期）**：

| 期 | 可观测性 | 治理操作 |
|---|---|---|
| **一期（本次）** | 契约 v1 + 校验器 + 实例注册/心跳 + 看板四视图 + omp 实例接入（心跳/任务事件） | **治理面基础**：任务 confirm/reject、**知识条目升级（待审核→已确认）**、**设计/方案文档落定确认**（自举：observatory 设计文档即首个对象）；治理操作全量发 governance.* 审计事件 |
| **二期** | 运行时层摄取（agent.db/会话/成本）✅、告警规则 ✅、**御驿消息结构化 ✅**（§7.2.1） | **治理面扩展**：**审批代办 ✅**（各实例 pending approval 上屏、主人在平台批准/拒绝——文件请求/应答协议）、评审队列确认面 ✅、跨 Agent 权限开放确认（身份归 Yuyi 插件，平台不接管）、ops_audit 治理视图 |
| **三期** | **不可变审计归档（RR-2 闭环）✅ 已实现**（哈希链封印 + 校验 + 篡改检测实测）· HTTP 上报端点 ✅ · **看板渲染烟测 ✅** · **omp-stats 集成评估 ✅**（结论：不集成 CLI，保持只读摄取） | **治理面完备**：**御符强验证 ✅**（重界定为「实例自验 + 证据存档」，平台不接管身份）· **跨实例统一治理 ✅**（治理地址簿 + 实例选择器 + 批量逐个留痕）· **治理写操作防线 ✅**（操作者显式 + 真实台账确认）· 治理操作合规留档 ✅（哈希链封印 + 全量 governance 事件） |

### 7.5 实施状态（随进度更新）

| 项 | 期 | 状态 | 验证证据 |
|---|---|---|---|
| 事件契约 v1 + 校验器 | 一期 | ✅ 完成 | `contracts/validate.mjs` 实测 PASS |
| 实例注册 + 心跳 | 一期 | ✅ 完成 | `omp-ops-pi-01` 容器心跳（30s）+ `dsh-architect-01`，看板双实例 online |
| 看板（团队/系统/实例/**协作**/知识/运行时/事件流/治理 八视图） | 一期+二期 | ✅ 完成 | 浏览器实测 + `render-smoke.mjs` 无浏览器回归；`public/index.html` 零构建 |
| 任务台账直读（`--tasks`） | 一期 | ✅ 完成 | OPSP-P0~P5 + GOV-TEST 全量呈现，yaml 现值为权威 |
| **任务治理 confirm/reject** | 一期 | ✅ 完成并端到端验证 | GOV-TEST：待确认 → 平台 confirm → 已落定；ledger 正确拒绝非法跳步与无来源确认（四不变量生效） |
| **知识条目升级** | 一期 | ✅ 实现（端点就绪） | `POST /api/govern/knowledge`；主人经 review-queue 纪律升级 2 条后队列空 |
| **文档落定确认** | 一期 | ✅ 自举完成 | 本设计文档自身：status 待确认 → 已落定（confirmedBy/confirmedVia 记录） |
| 运行时层（agent.db 只读摄取） | 二期 | ✅ 完成 | `/api/runtime` 实测 3 模型（deepseek-flash 194 样本 / glm-5.3-flash 139 / MiniMax-M3 10） |
| HTTP 上报端点 | 二期 | ✅ 完成 | `POST /api/events` 实测 accepted=1 rejected=0 |
| 告警规则 + 抑制 + 历史 | 二期 | ✅ 完成并端到端验证 | 5 条规则加载；注入 critical 事件 → 2 条告警触发 → 二次快照 suppressed=true → 历史仅记首次 |
| 健康端点 | 二期 | ✅ 完成 | `/api/health`：pid/uptime/五数据源全 ok/规则数 |
| 知识视图 + 事件实时流 | 二期 | ✅ 完成 | 看板视图实现（评审队列明细/知识域事件/事件流筛选+10s 刷新） |
| **审批代办（含参考实现）** | 二期 | ✅ 完成并端到端验证 | pending 写入 → 平台 approve → 决定文件 → 参考实例收到"allow by 主人" → pending 清理；超时自动 deny 已实现 |
| 御驿消息结构化 | 二期 | ✅ 完成并端到端验证 | 契约 §7.2.1：临时数据根 e2e 4 对端（3 已验证 / 1 未验证）+ 闸门拒绝 2；契约负测 4/4 命中；摄入**混批**修复实测 accepted=1/rejected=2（修复前会误收 3 条） |
| **不可变审计归档（RR-2）** | 三期 | ✅ 完成并篡改检测实测 | `seal.mjs` 哈希链封印 + `--verify` 校验（闭日严格/当日检查点）；实测：篡改已封印文件 → FAIL 并定位；复原 → PASS；`/api/archive` 看板呈现 |
| 御符强验证（Yufu 对接） | 三期 | ✅ 完成（重界定为「实例自验 + 证据存档」） | `platform.identity.verified` 契约 + 校验器 + 看板三态（已验证/失效/未申报）+ **身份漂移检出**；`identity-demo` 四态实测；平台不接御符内部 API（身份归 Yuyi 插件） |
| 跨实例统一治理 | 三期 | ✅ 完成并端到端验证 | 治理地址簿 `data-roots.yml` + 实例选择器（自动填 root）+ 批量逐个留痕；隔离夹具实测放行、生产台账实测拦截 |
| 治理写操作防线 | 三期 | ✅ 完成并实测 | 操作者显式（服务端拒绝空 by）+ 真实台账 `confirmReal` 拦截（实测 400）；2026-09-12 两次误操作已回滚并追加留痕 |
| 看板渲染烟测 | 二期+ | ✅ 完成 | `contracts/render-smoke.mjs`：node:vm + 最小 DOM stub 真实执行 `render()`，8 视图 + 空态降级 PASS（无需浏览器） |

## 8. 决策门记录

| 门 | 决策 | 决策人/时间 |
|---|---|---|
| 边界 | 团队架构全面设计、实现分期 | 主人 2026-09-12 |
| 事件承载 | 文件约定起步 + HTTP 预留 | 主人 2026-09-12 |
| 实例身份 | 御符；三态诚实分级：自报 / Hub 回填 / 实例自验（§7.1） | 主人 2026-09-12 |
| 治理面 | 包含 confirm/审批操作（平台=主人操作界面） | 主人 2026-09-12 |
| 身份归属 | Yuyi 身份插件自治：观测面不接管身份、不接御符内部 API（B1 跨团队请求撤销） | 主人 2026-09-12（工作指示） |
| 治理可信性 | 操作者显式 + 真实台账确认 + 负测隔离（两次误操作后加固，§7.4） | 架构师会话自主加固，**待主人追认** |
