# Architect Observatory — 架构师 Agent 团队可观测性平面

> 设计文档：`docs/design/observatory-architecture-design.md`（v4.3 已落定）
> 定位：为架构师 Agent **团队**（多实例 × 多宿主 × 多系统，含共管）提供统一可观测性与治理操作面。
> **平台是主人的操作界面**——所有确认/审批的决定权在主人，平台只负责呈现与执行（不旁路任何既有机制）。

## 快速开始

```powershell
# 启动：在【可见终端】里手动启动（前台，Ctrl+C 停止）
node observatory/server.mjs --tasks "E:\Development\Code\nodejs\ops-pi\docs\tasks"

# 访问看板
start http://127.0.0.1:8787

# 停止（精确，按数据根下的 pid 文件）
# 先读 obs\server.pid 核对命令行含 server.mjs，再 Stop-Process -Id <pid>
```

> ⛔ **禁止**把本平台（或任何本仓脚本）注册为**登录自启计划任务**，**禁止**用 `Start-Process -WindowStyle Hidden` 隐藏窗口启动。
> 二者在这台装有行为检测杀软的机器上会被判定为木马（详见「常驻方式与安全约束」）。

## 八个视图

| 视图 | 内容 |
|---|---|
| **团队总览** | 实例列表（御符/宿主/负责系统/心跳/**身份自验**）· 身份自验总览 · 告警区（含抑制状态）· 健康信息 · 审批挂单 · 治理留痕 |
| **系统视图** | 按「被负责系统」聚合：负责实例 + 任务四态看板 |
| **实例视图** | 单实例身份自验详情 + 事件流（最近 15 条）+ 心跳详情 |
| **协作** | 御驿消息结构化：对端清单（御符 id / Owner / 角色 / 流向计数 / **身份来源**）· 闸门拒绝证据 · 最近消息事件 |
| **知识视图** | **知识库全量条目（38+，五类分布/状态/确认与更新日期）** · 最近更新 · 评审队列明细 · 知识域事件 · 知识治理留痕 |
| **运行时** | omp agent.db 只读摄取：按模型的样本数 / 输出 tokens / 平均生成耗时 / 平均 TTFT |
| **事件流** | 全实例事件实时流（最近 60 条，按实例筛选，10s 自动刷新） |
| **治理操作** | **跨实例统一治理**：实例选择器（地址簿自动填 root）+ 任务 confirm/reject（支持批量，逐个留痕）· 知识条目升级 · 操作者必填 |

## 身份语义（三态诚实分级，§7.1）

| 态 | 来源 | 呈现 |
|---|---|---|
| **自报** | 实例注册文件 `instanceId` | 标注「自报」 |
| **回填** | 跨实例消息对端身份由 Yuyi Hub 权威回填（客户端不可伪造） | 协作视图标「Hub 回填」 |
| **自验** | 实例调 `yufu_verify` 验证自身 token 后上报 `platform.identity.verified` | 标「已验证 / 失效 / 未申报」+ **身份漂移检出** |

**平台不接御符内部 API、不做身份验证**（Yuyi 身份插件自治）；验证在实例侧完成，平台只存档证据。
参考实现：`identity-demo/instance.mjs`（四态：已验证/失效/未申报/漂移）。

## 三类治理操作（决定权在主人）

| 操作 | 端点 | 执行机制（均不旁路） |
|---|---|---|
| 任务 confirm / reject | `POST /api/govern/task` | 调 `task-ledger.mjs` CLI，四不变量（状态机/来源必填/留痕/归档）由 ledger 强制 |
| 知识条目升级（待审核→已确认） | `POST /api/govern/knowledge` | 修订条目 frontmatter status + 发 governance 审计事件 |
| 审批代办 approve / deny | `POST /api/govern/approval` | 写决定文件 + 发 `approval.resolved` 事件 + 清理挂单 |

**审计**：三类操作均发 `governance.*` 事件，落到 `obs/events/`。

## 治理操作可信性防线（重要）

| 防线 | 规则 |
|---|---|
| **操作者显式** | 治理端点**必须**带 `by`；平台**不代填「主人」**（服务端函数层纵深同样拒绝空 by） |
| **真实台账确认** | `root` 命中治理地址簿（`data-roots.yml`）即视为生产台账：**脚本/自动化调用**必须显式带 `confirmReal=true`；看板人工操作经二次确认后自动携带 |
| **负测隔离** | 治理类**合法写路径**测试一律指向 `observatory/test-fixtures/fake-ledger`；生产台账只允许测拒绝路径 |
| **回滚留痕** | 误操作以追加 `rollback` 事件更正，不抹除历史 |

> 起因：2026-09-12 本会话两次在负测中误对生产台账（ops-pi OPSP-P0）执行 confirm，均已回滚并留痕。
> 复盘：`docs/designs/2026-09-12-治理写操作误用-事故复盘.md`（时间线 / 分层根因 / 加固实测）。
> ~~残余风险：平台无认证~~ → **2026-09-12 已实现受保护模式**（上报=御符 token 验证 + verifiedAs 注记；查看/治理=管理员令牌；非回环绑定强制启用，缺配置拒绝启动）。本机回环默认仍为信任模式（单机场景零配置）。
> **升级触发条件**：改为监听非回环地址、或引入多用户/远程访问时，「本地令牌或复用御符身份」升级为**前置必修**。

## 治理地址簿（跨实例统一治理）

`data-roots.yml` 登记「实例 → 台账根」，治理页实例选择器据此自动填 `root`。
**`taskRoot` 必须是平台所在主机视角的路径**（容器内 `/workspace` ≠ 宿主路径）；仅支持本地路径，跨主机需远端执行面（未支持）。

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
| 御驿消息结构化 | `contracts/validate.mjs`（域约定）+ 设计文档 §7.2.1 | `collab.message.*` 必带 `direction`；身份三元组（peerAgentId/peerOwner/peerRole）**整体来自 Hub 回填**或整体缺席；`peerOwner` 在位而 `peerAgentId` 缺席 → FAIL |
| 身份自验证据 | `contracts/validate.mjs`（域约定） | `platform.identity.verified` 必带 `identityId`(非空) / `verified`(boolean) / `via`；`verified=false` 必带 `reason` |
| 审批代办契约 v1 | `contracts/approval-request-v1.md` | 文件请求/应答协议（pending → decisions）+ 事件对 |
| 渲染烟测 | `contracts/render-smoke.mjs` | node:vm + 最小 DOM stub 真实执行 `render()`：8 视图关键内容 + 无 `undefined`/`NaN` + 空态降级（无需浏览器），`node contracts/render-smoke.mjs` |
| 参考实现 | `approval-demo/`、`collab-demo/`、`identity-demo/` | 契约活样例；**仅在隔离数据根注入**（不污染生产看板） |
| 隔离夹具 | `test-fixtures/fake-ledger/` | 治理合法写路径的测试目标（不落盘），保证测试无生产副作用 |

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

**通用心跳 / 身份自验工具**（dsh 及其它宿主）：

```powershell
# 单次（验证/CI）；首次创建需声明实例身份要素
node observatory/heartbeat.mjs --instance my-instance --systems a,b --host "描述" --host-type dsh --once

# 常驻实例心跳由平台进程自身维护（server --heartbeat <实例id>，无需独立进程）
```

**语义**：只刷新心跳字段（`status` / `lastSeenAt` / `heartbeatIntervalSec`），**保留实例自身声明的** `systems` / `capabilities` / `host`——心跳工具不覆盖身份声明。

**身份自验（可选，不配置则不发证据）**：加 `--yufu-url http://127.0.0.1:<port>` 与环境变量 `YUFU_CREDENTIAL=<御符 token>` → 调 `POST /api/v1/auth/agent/verify`，把结论作为 `platform.identity.verified` 上报。**未配置时不发事件**——平台不做身份验证，也不接受凭空证据。

> ⛔ 本工具**只用于手动单次调用或随平台进程运行**；**禁止**注册为计划任务（2026-09-12 事故，见下节）。

## 常驻方式与安全约束（2026-09-12 事故后定稿）

**⛔ 硬性禁止**（违反会触发杀软把 dsh-desktop 本体判为木马并杀掉进程树）：

| 禁止 | 原因 |
|---|---|
| 把本平台/本仓脚本注册为**登录自启计划任务** | Defender 判定 `Trojan:Win32/Bearfoos.A!ml`——「AppData 下可执行 + 快捷方式 + 卸载项 + **持久化**」是广告/安装器行为链，检测落在 `dsh-desktop.exe` 及其快捷方式上 |
| `Start-Process -WindowStyle Hidden`（隐藏窗口启动） | Defender 判定 `Trojan:Win32/PowhidSubExec.B`（PowerShell 隐藏子进程执行） |

**正确做法**：

```powershell
# 需要时在可见终端手动启动（前台；Ctrl+C 停止）
node observatory/server.mjs --tasks "E:\Development\Code\nodejs\ops-pi\docs\tasks" --heartbeat dsh-architect-01

# 或后台启动但窗口可见（不做隐藏）
Start-Process -FilePath node -ArgumentList "observatory/server.mjs" -WorkingDirectory "E:\Development\Code\nodejs\digital-architect"
```

**常驻能力已内建**：平台进程每 30s 刷新自身心跳；`--heartbeat <实例id>[,<id>...]` 时同时刷新这些本地实例的心跳——**不再需要任何独立心跳进程或计划任务**。

**升级触发条件**：若将来确实需要开机自启，应先在杀软中为本仓与 DSH-Desktop 配置**排除项**（变更安全姿态，需主人同意），而不是直接注册任务。

**启动参数**：`--port <n>`（默认 8787）· `--host <addr>`（默认 127.0.0.1；绑定非回环即进入**受保护模式**）· `--root <总仓根>`（知识库/告警规则/缺省 tasks 与 agent.db）· `--data <数据根>`（缺省 `<root>/obs`）· `--tasks <dir>`（可重复，台账目录）· `--agentdb <path>` · `--alert-cooldown-ms <n>` · `--heartbeat <实例id,...>`（平台进程内建心跳）

**多宿主上报与认证（受保护模式）**：绑定非回环地址或 `--require-token` 时进入受保护模式——
- **上报者**（各宿主实例/采集器）：`POST /api/events` 必须带 `Authorization: Bearer <御符token>`，平台调 `yufu_verify` 验「谁在上报」，验证通过的 agentId 以 **`verifiedAs`** 平台注记写入事件（平台生成的溯源元数据，非实例自报）；验证结果按 token 摘要缓存 10 分钟（仅内存）
- **查看/治理**：所有读端点与治理端点要求 `x-obs-admin: <管理员令牌>`；看板 401 时会提示输入一次（存 sessionStorage）
- 受保护模式缺 `--admin-token` / `--yufu-url` 直接**拒绝启动**（不得半暴露）
- 多宿主架构语义：**事件契约是唯一真实数据面**；文件约定与 agent.db/yuyi 本机摄取是「同宿主优化」，远程宿主的运行时/协作数据应由该宿主的采集器转写为事件上报

**进程登记**：PID 写入 **`<数据根>/server.pid`**（`obs/server.pid`）——多实例/临时数据根并存互不覆盖。

**进程管理纪律（重要）**：只按 `obs\server.pid` 登记精确启停；**禁止** `Get-Process node | Stop-Process`（会杀掉宿主进程树，见 `architect-knowledge/practice/suite-build-lessons.md`）。

**排障**：`GET /api/health` 看数据源探测；服务起不来时核对 8787 占用者的命令行；`obs/` 为追加数据，删除即回退。

## 目录结构

```
observatory/
├── server.mjs                 平台服务（零 npm 依赖，仅 node: 内置模块）
├── seal.mjs                   审计归档封印与校验（哈希链）
├── heartbeat.mjs              通用实例心跳工具（+ 可选身份自验上报）
├── alert-rules.yml            告警规则 v1（5 条，支持抑制窗口）
├── data-roots.yml             治理地址簿（实例 → 台账根）
├── public/index.html          看板单页（原生 JS，无构建，8 视图）
├── contracts/                 事件契约校验器 + 渲染烟测 + 审批代办契约
├── approval-demo/             审批参考实现 + 说明
├── collab-demo/               御驿消息结构化参考实现
├── identity-demo/             身份自验证据参考实现（四态）
└── test-fixtures/fake-ledger/ 隔离台账夹具（治理测试专用，不落盘）
obs/                           运行时数据根（gitignore）
├── server.pid                 运行中实例 PID（数据根归属，gitignore）
├── instances/                 实例注册与心跳
├── events/<instanceId>/       事件流 NDJSON（按实例分文件，无并发竞争）
├── events/http/               HTTP 上报落点
├── approvals/{pending,decisions}/
├── archive/                   封印链（seals.ndjson）+ 快照清单
└── alerts-history.ndjson      告警历史
```

## 分期状态

- **一期 ✅ 完成**：契约 v1 + 校验器 + 实例注册/心跳 + 看板 + omp 实例接入 + 任务治理 confirm + 双实例冒烟
- **二期 ✅ 完成**：运行时层（agent.db 只读摄取）· HTTP 上报端点 · 告警规则 + 抑制 + 历史 · 健康端点 · 知识视图 + 事件实时流 · **审批代办端到端** · **御驿消息结构化**（§7.2.1，B1 已解除）
- **三期 ✅ 完成**：**不可变审计归档**（哈希链封印 + 篡改检测）· **御符强验证**（重界定为实例自验 + 证据存档）· **跨实例统一治理**（地址簿 + 选择器 + 批量）· **治理写操作防线** · **看板渲染烟测**
- **剩余（非阻断）**：跨主机治理的**远端执行面**（治理指令下发到实例侧 agent 执行；上报/认证通道已就绪）
- **已实现（2026-09-12）**：受保护模式——上报者御符 token 验证（verifiedAs 溯源注记）+ 管理员令牌门 + 非回环强制启用
- **演进中（待主人确认设计方案）**：平台独立部署 Model B——平台脱离大脑仓常驻（打包独立发布 / 配置迁数据根 / 大脑仓 git 镜像 / governor 远端执行面），方案见 `docs/designs/2026-09-12-平台独立部署演进-技术方案.md`；在此之前**平台随大脑仓部署**（仓在哪平台在哪）是显式前提而非隐含假设
- **已评估不实施**：`omp stats` CLI 集成——它读同一 `agent.db`，直接只读摄取更同源、无 CLI/输出格式耦合（成本列 `client_usage.cost_usd` 与 `usage_history` 当前为空，待数据积累再做成本/趋势视图）
