---
title: dsh 套件成员清单与关键路径速查（Architecture Map 索引）
domain: dsh-ecosystem
source:
  origin: digital-twin/docs/suite-charter.md + digital-architect/docs/HANDOFF.md
  ref: 宪章 §2 依赖矩阵；HANDOFF §8 关键文件与接口速查
confirmed: 2026-09-09
status: 已确认
owner: 主人
---

# dsh 套件成员清单与关键路径速查（Architecture Map 索引）

> **引用不复制**：本条目只是索引。成员能力的权威描述以宪章 §2 依赖矩阵为准；各仓细节以其 README 为准。

## 套件根与宿主

| 项 | 值 |
|---|---|
| 套件根 | `E:\Development\Code\nodejs\digital-twin`（git，remote=github.com/lomehong/*） |
| 套件宪章（Architecture Map） | `digital-twin\docs\suite-charter.md` |
| 桌面宿主 | dsh-desktop（Tauri），核心 0.1.5-alpha.2，web 端口固定 3088 |
| 家目录（DSH_HOME） | `C:\Users\lome\AppData\Local\dsh-desktop-app-data\home` |
| web profile | `home\profiles\web\package.json`（14 个 bundle；插件经 junction/link 指向套件源码仓） |
| 宿主 HTTP 基址 | `http://127.0.0.1:3088`（web 会话 cookie；token 在 `dsh-desktop.log` 尾部 `dsh web:` 行） |
| 官方源码 checkout | `E:\Development\Code\nodejs\deepseek-harness`（tag dsh-v0.1.5-alpha.2，研究宿主 API 用） |

## 成员清单（提供 → 谁消费）

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

> **引用不复制**：以下知识全文在各自仓内，本表只做寻址。`status: 待审核` = 未经主人确认，引用前回源 sources。

| 仓 | 知识面 | 说明 |
|---|---|---|
| dsh-memory | 仓内 `AGENTS.md` + `.knowledge/`（role/interfaces/dependencies/constraints） | 认识论治理/替代链/装配红线；consumed_by 含 im-channel·task-board·twin·actors·yuyi 逐符号映射 |
| dsh-task-board | 同上 | 任务状态机两套+红线（自报≠完成/防自批/M-3 服务面收敛）；治理缺席降级矩阵 |
| dsh-twin | 同上 | 预设物化版本机制/四卡生效门/守卫 GUARD_TEXT 红线；主/访客 fail-closed |

试点走查与漂移发现（含三仓文档-代码矛盾 4 项）见 `docs/designs/2026-09-10-service-knowledge三仓试点-走查记录.md`。

## 架构层分析的使用提示

- 做 dsh 生态影响面分析时：先查宪章 §2 矩阵确定「谁提供、谁消费、缺席降级是什么」，再进具体仓 README/源码核对**当前行为以代码为准**。
- 本表成员清单截至 2026-09-09；新插件加入后须同步宪章 §2 与本索引。
