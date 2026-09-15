---
title: dsh 套件成员清单与关键路径速查（Architecture Map 索引）
domain: dsh-ecosystem
source:
  origin: dsh/docs/suite-charter.md + digital-architect/docs/HANDOFF.md
  ref: 宪章 §2 依赖矩阵；HANDOFF §8 关键文件与接口速查；2026-09-11 成员巡逻（仓库地址与成员目录实况）
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# dsh 套件成员清单与关键路径速查（Architecture Map 索引）

> **引用不复制**：本条目只是索引。成员能力的权威描述以宪章 §2 依赖矩阵为准；各仓细节以其 README 为准。

> **⚠️ 漂移回写记录（2026-09-11）**：本条目原记的三处**设备绝对路径**（套件根/家目录/官方 checkout）已失效；
> 按主人 2026-09-11 指示——**知识库不记设备路径**（不同设备不同，违反宿主中立），改记**仓库地址 + 发现方式**。
> 成员清单亦补 4 个新成员入「待蒸馏区」（能力未核，不得引用）。
> 漂移发现方式：架构师 v3 解耦走查中 `TARGET_PROJECT` 指向旧路径时容器 workspace 为空。处置见 `practice/knowledge-drift-cases.md`。

## 套件仓库与宿主（记地址与发现方式，不记设备路径）

| 项 | 值 |
|---|---|
| 套件仓（10+ 插件 monorepo） | `github.com/lomehong/digital-twin`（本地目录名可能不同，如 `dsh`） |
| 套件宪章（Architecture Map） | 套件仓内 `docs/suite-charter.md` |
| 本仓（架构师体系） | `github.com/lomehong/digital-architect` |
| 官方宿主源码 | `github.com/deepseek-ai/deepseek-harness`（研究宿主 API 用，按 tag 对齐核心版本） |
| 桌面宿主 | dsh-desktop（Tauri），核心 0.1.5-alpha.2，web 端口固定 3088〔版本号未复核〕 |
| 家目录（DSH_HOME） | **设备特定，不入库**；查询方式：宿主日志/设置界面（dsh-desktop 为 `dsh-desktop-app-data\home`），会话内以实际环境为准 |
| 试点仓 oh-my-ops | `github.com/lomehong/oh-my-ops`（omp 扩展运维智能体 omo；v0.7.0 起自包含安装器：bun compile 单文件运行时 + ~/.omo 私有域，与原生 omp 零接触；非套件成员，详见 oh-my-ops 仓 README 与 docs/reports/） |
| web profile | `home\profiles\web\package.json`（相对 DSH_HOME；bundle 清单；插件经 junction/link 指向套件源码仓） |
| 宿主 HTTP 基址 | `http://127.0.0.1:3088`（web 会话 cookie；token 在 `dsh-desktop.log` 尾部 `dsh web:` 行） |

## 成员清单（提供 → 谁消费）

> 2026-09-11 实测成员目录共 14 个（+外部件 dsh-architect）：下表 11 条为既有已核条目；
> 新发现的 4 个成员列于表末「待蒸馏」区，**能力描述未核前不得引用**。

| 插件 | 提供 | 被谁增强消费（缺席降级） |
|---|---|---|
| dsh-twin | 分身核心：noteActor/seedMemory/enqueueLearning、agentPresets、守卫纪律 | 记忆种子→dsh-memory；汇报闸→dsh-ledger；投递→im-channel；活动区段→dsh-task-board |
| dsh-memory | 共享记忆（早加载）；HTTP `GET/POST /dsh-memory/entries`（POST 需 `x-memory-token`）；`entries/update` 替代语义；`assemblePack` 按回合装配 | im-channel（记忆挂载/装配）、dsh-task-board（结果沉淀）、dsh-twin（知识种子） |
| dsh-task-board | 任务看板（唯一活动权威）；web 路由 + 客户端 + 工具（task_delegate/claim/report/approve）；`state()`/`activity()` | dsh-ledger（L0-L3 裁决，缺席走本地保守降级）、dsh-memory（沉淀） |
| dsh-ledger | 委托账本 L0-L3；`tools/pre-execute` 治理钩子 + post-execute 留痕；`GET /dsh-ledger/approvals` | dsh-twin（否决回流）、dsh-task-board |
| dsh-yuyi | 御驿通信（跨设备协同）；**submodule 双总仓共享**（digital-twin / digital-architect 各持独立指针，决策 D10） | 无套件依赖（零耦合标杆）；架构师 Agent 经它与数字分身通讯（见 `../scenario/architect-twin-collaboration.md`） |
| dsh-actors | 实体注册表/别名归一（可选身份增强） | im-channel/dsh-memory 顺带注册 |
| dsh-regression | 影子测试/回归（HostRunner 经 typertGateway 驱动真实会话） | — |
| dsh-computer | 电脑操作 | — |
| dsh-redact | 出站脱敏：`redact` 钩子 + `masking` 服务 | im-channel（出站脱敏） |
| dsh-im-bot（im-channel + ui-settings-im） | IM 渠道 pushToUser/botsStatus；IM 设置界面 | dsh-memory（渠道身份挂载）、`masking`、dsh-actors |
| dsh-architect（**外部协作件**，宪章 v1.4 已退出套件清单） | `dsh-architect` 服务（checkDesign/checkDigest/renderReviewSkeleton）+ `tool-architect` 工具入口（architect_digest/design/review） | **归 digital-architect 总仓**（submodule，决策 D10）；仍零套件依赖、纯函数零持久化；经宿主 profile 加载，dsh-twin 按包名探测追加工具行（与挂靠哪个总仓无关）；影响面分析时按「宿主加载的外部插件」对待 |

### 待蒸馏成员（2026-09-11 实测新增，**能力未核**）

| 目录 | 状态 |
|---|---|
| dsh-model-failover | 存在（实测）；提供/消费关系**未知**，待蒸馏后补 |
| dsh-plugin-manager | 存在（实测）；同上 |
| dsh-remote | 存在（实测）；同上 |
| dsh-yuheng | 存在（实测）；同上 |

> 纪律：未核成员不得参与影响面分析结论；需要时先走 `knowledge-distill` 或 service-knowledge 蒸馏。

## 关键接口速查

| 接口 | 值 |
|---|---|
| 记忆读取 | `GET http://127.0.0.1:3088/dsh-memory/entries`（`x-memory-token`，token 经 `GET /dsh-memory/token`） |
| 记忆写入/更新 | `POST /dsh-memory/entries`；替代更新 `POST /dsh-memory/entries/update`（更新产生新条目、历史保留） |
| 看板 | `GET /dsh-task-board/state` + `POST /dsh-task-board/action`（run/claim/confirm/archive/update/delete） |
| 桥配置探测 | `http://127.0.0.1:3088/ext/bridge-config` |
| 守卫纪律源码 | `dsh-twin\src\index.ts`（GUARD_TEXT，约 L241） |
| 看板客户端双写面板样例 | `dsh-task-board\src\client\index.tsx`（L458+） |

## 系统层知识面（service-knowledge 试点，2026-09-10）

> **引用不复制**：以下知识全文在各自仓内，本表只做寻址。`status: 已确认` = 未经主人确认，引用前回源 sources。

| 仓 | 知识面 | 说明 |
|---|---|---|
| dsh-memory | 仓内 `AGENTS.md` + `.knowledge/`（role/interfaces/dependencies/constraints） | 认识论治理/替代链/装配红线；consumed_by 含 im-channel·task-board·twin·actors·yuyi 逐符号映射 |
| dsh-task-board | 同上 | 任务状态机两套+红线（自报≠完成/防自批/M-3 服务面收敛）；治理缺席降级矩阵 |
| dsh-twin | 同上 | 预设物化版本机制/四卡生效门/守卫 GUARD_TEXT 红线；主/访客 fail-closed |

试点走查与漂移发现（含三仓文档-代码矛盾 4 项）见 `docs/designs/2026-09-10-service-knowledge三仓试点-走查记录.md`。

## 核心五件调用关系与数据主责（2026-09-10 蒸馏，P2-2）

> **权威声明**：成员依赖的权威是宪章 §2 矩阵；本节为**调用关系细化层**，冲突以宪章+代码为准。
> 强弱判定 = 代码结构推断（硬注入/fail-closed=强；可选注入/软降级=弱），未做运行时实验。
> 置信度：行 4/8/9/13 高（已确认 dependencies.yaml / P1-1 实证）；行 5/12 中（跨仓事实部分未逐仓 grep 全量）。

### 调用边（提供 → 消费）

| # | 边 | 接口类型 | 强/弱 | 缺席降级（消费方视角） | source |
|---|---|---|---|---|---|
| 1 | dsh-memory → dsh-twin | cordis 服务 | 弱 | 种子不落库、记忆规整不可用、开环状态源为空 | dsh-twin/.knowledge/dependencies.yaml |
| 2 | dsh-memory → dsh-task-board | cordis 服务 | 弱 | 终态沉淀跳过，看板终态不受影响 | dsh-task-board/.knowledge/dependencies.yaml |
| 3 | dsh-memory → dsh-im-bot(im-channel) | cordis 服务 | 弱 | 记忆工具缺席、摘要跳过、按回合装配默认关 | dsh-memory/.knowledge/dependencies.yaml |
| 4 | dsh-memory → dsh-actors | 服务（关系轨读取） | 弱 | 仅注册表视图 | dsh-memory/.knowledge/dependencies.yaml |
| 5 | dsh-task-board → dsh-ledger | cordis 服务 | **强**（治理语义） | 本地降级：L2 拦截+尽力通知、L3 拒绝 | dsh-task-board/.knowledge/dependencies.yaml |
| 6 | dsh-task-board → dsh-im-bot(im-channel) | cordis 服务（通知） | 弱 | 静默跳过 | dsh-task-board/.knowledge/dependencies.yaml |
| 7 | dsh-task-board → typertGateway | cordis 服务 | **强**（硬依赖） | 不适用（缺席不可运行）；投递失败可退避重试 | dsh-task-board/.knowledge/dependencies.yaml（gateway.ts:GatewayClient） |
| 8 | dsh-twin → dsh-ledger | cordis 服务 | 弱 | 触达跳过闸门继续投递（D4 矛盾已登记）；否决不入学习队列 | dsh-twin/.knowledge/dependencies.yaml |
| 9 | dsh-twin → dsh-task-board | cordis 服务（activityView） | 弱 | twin-activity 段降级为空串 | dsh-twin/.knowledge/dependencies.yaml |
| 10 | dsh-im-bot(im-channel) → dsh-twin | cordis 服务（noteActor） | 弱（存在）/**强**（语义：fail-closed） | 未标注会话按访客视图渲染 | dsh-twin/.knowledge/constraints.yaml |
| 11 | dsh-twin → 预设可选工具行五包 | preset 行探测 | 弱 | 不追加对应工具行，预设仍可挂载 | dsh-twin/.knowledge/interfaces.yaml |
| 12 | 分身/主人会话 → dsh-yuyi | 模型工具（对外消息） | **强**（对外语义） | 对外消息不可发（显式报错，非静默） | 御驿需求包 §8.1（2026-09-10-御驿消息重试-需求包.md） |
| 13 | 架构师/分身会话 → dsh-architect | 模型工具 + cordis 服务 | 弱 | 工具缺席 SKILL 照跑（六维/五问人工执行） | adapters/dsh.md 降级面；P1-1 实证 |

### 数据主责（谁拥有哪类数据的唯一事实源）

| 件 | 数据主责 | 存储 | 一致性边界 | source |
|---|---|---|---|---|
| dsh-memory | 共享记忆/关系轨 | `$DSH_HOME/dsh-memory/`（json+归档+receipts） | 替代链禁原地覆盖；文件锁+原子写；活跃 500 上限；UTC | dsh-memory/.knowledge/constraints.yaml |
| dsh-task-board | 任务账本 | `$DSH_HOME/dsh-task-board/ledger.json` | 主人确认才终态；原子写；接管留痕 | dsh-task-board/.knowledge/constraints.yaml |
| dsh-twin | 人格四卡/学习队列 | `$DSH_HOME/.agent-presets/digital-twin/`（物化）+ config | 生效=确认+回归双条件；记忆规整信任域隔离 | dsh-twin/.knowledge/constraints.yaml |
| dsh-yuyi | 出站账本/任务记忆 | `~/.yuyi/`（sent-messages.jsonl、tasks/） | message.id 幂等；Hub at-least-once；不自动重发（Hub 契约） | 御驿需求包 §8.1/§8.3 |
| dsh-architect | 无（纯函数零持久化） | — | 同输入同输出 | dsh-architect/src/index.ts 头注 |

## 架构层分析的使用提示

- 做 dsh 生态影响面分析时：先查宪章 §2 矩阵确定「谁提供、谁消费、缺席降级是什么」，再进具体仓 README/源码核对**当前行为以代码为准**。
- 本表成员清单截至 2026-09-09；新插件加入后须同步宪章 §2 与本索引。
