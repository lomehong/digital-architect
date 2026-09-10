# digital-architect · 架构师 Agent

> 让大型存量分布式系统成为 AI 可理解、可推理、可验证的工程系统，使 AI Agent 能完成**技术方案设计**（架构师核心职能）。
> 第一个落地区域：我们自己的数字分身套件与 dsh 宿主（自举——知识源全在手边）。

## 一句话

基于**数字分身套件已有的 Harness 机制**（任务看板/账本治理/共享记忆/守卫纪律/验收语义）+ **两篇方法论文章**（阿里技术《AI Friendly 后端架构》与千问平台《架构师 Agent 系统化落地》），搭建架构师 Agent。**架构师 Agent ≠ 从零写新 Agent**：分身已有的 Harness 不动，补三个新件——知识工程（`architect-knowledge/`）、三个流程 SKILL（`skills/`）、产出规范（`templates/`）。

## 目录结构

```
digital-architect\
├── docs\HANDOFF.md                 ← 交接文档（唯一上下文来源，含方法论蒸馏 §3 与执行清单 §6）
├── adapters\                        ← 宿主适配层（决策 D9：一个宿主一个文件）
│   ├── README.md                    ← 适配协议：五面映射 + 宿主判别规则
│   ├── dsh.md                       ← dsh 适配（已验证）
│   └── oh-my-pi.md                  ← oh-my-pi 适配
├── architect-knowledge\            ← 知识工程（五类结构，git 管理）
│   ├── meta\                       ← 业务元语/核心对象/别名/边界/项目决策
│   ├── principle\                  ← 跨场景原则（方法论/套件宪章原则/设计检查原则）
│   ├── scenario\                   ← 场景→技术映射（架构设计流水线）
│   ├── practice\                   ← 历史决策/事故教训/可复用模式
│   └── reference\                  ← 外部领域引用（不复制对方知识）
├── skills\
│   ├── architect-prd-digest\       ← 需求准入：六项覆盖检查 → 结构化需求包
│   ├── architect-design\           ← 设计主流程：渐进披露四层装载 → Gap Analysis → 六维度方案
│   └── architect-review\           ← 方案评审：五问检查 + 六维度覆盖评分
└── templates\
    └── executable-design.md        ← 可执行技术方案模板（六维度+五问）
```

## 多宿主支持（dsh + oh-my-pi）

架构师 Agent 的核心资产——知识库、三个 SKILL、方案模板——是**宿主中立**的（决策 D9，原则见 `architect-knowledge/principle/host-neutral-core.md`）。宿主特定机制（会话内提问、审批、任务面、记忆面、技能挂载、检查器安装）收敛在 `adapters/`，一个宿主一个文件；SKILL 执行前按会话可用工具判别宿主并装载对应适配文件，判别不了直接问主人，**治理机制缺席一律收敛保守侧（停止问主人，不静默放行）**。

| 宿主 | 适配文件 | 检查工具 |
|---|---|---|
| dsh（DeepSeek Harness / digital-twin 套件） | [`adapters/dsh.md`](adapters/dsh.md) | dsh-architect 插件（tool-architect） |
| [oh-my-pi](https://github.com/can1357/oh-my-pi)（omp） | [`adapters/oh-my-pi.md`](adapters/oh-my-pi.md) | dsh-architect 仓 `./omp` 导出（CustomToolFactory，与 dsh 同一组纯函数） |

新增宿主 = 复制一份适配文件覆盖五个面；不修改 SKILL 与知识库。

## 三个 SKILL 的协作关系

```
需求 ──→ architect-prd-digest ──→ 结构化需求包
              │（准入不通过：登记未知/待确认，返回补齐）
              ▼
        architect-design ──→ 可执行技术方案（templates/executable-design.md）
              │（人工决策门：ask_user 会话内 + 账本审批今日待办）
              ▼
        architect-review ──→ 五问验收 + 覆盖评分
              │（通过：方案落定 → 拆看板任务 → 认领执行 → 自报 → 主人确认 → 经验沉淀回灌知识库）
              ▼（不通过：带评审意见返回 architect-design）
```

## 首个领域：dsh 生态自身（自举）

知识蒸馏来源（全在手边）：

1. `E:\Development\Code\nodejs\digital-twin\docs\suite-charter.md`（套件宪章 = Architecture Map 级）
2. 两篇文章条目（dsh-memory：`mem_1788973443918_oagd2n`、`mem_1788978083156_yycfzp`）
3. 各仓 README + `docs\HANDOFF.md`
4. 源码本身（10 仓，service-knowledge 阶段再系统生成）

## 路线（2026-09-09 状态）

- **阶段 1 ✅**：知识工程地基——五类 13 条 + 3 SKILL + 模板（纯文件，零代码）。
- **阶段 2 ✅**：自举首跑——三件套走查（`docs/designs/`），SKILL 挂载实测被宿主发现；方案已获主人五问验收落定（2026-09-09）。
- **阶段 3 ✅**：dsh-architect 插件 v0.1.0（`lomehong/dsh-architect`，24 测试全绿，宪章 v1.2 准入）；主人确认接线——profile 已接（junction + bundles），**重启桌面版生效**；分身工具行经 dsh-twin PRESET_VERSION 11 条件装配（aa88a49）。
- **阶段 4 ✅（首批）**：dsh-desktop System Card + 公众号采集 runbook（`docs\runbook-公众号采集.md`）；service-knowledge 全量化与管道常态化待主人排期。

详见 `docs\HANDOFF.md` §6 与 `docs\designs\`。

## 纪律（主人叮嘱，见 HANDOFF §9）

1. 角色纪律：执行会话自报、主人确认——任何会话不代劳别人的角色动作。
2. 一切知识进结构：工作必须有看板痕迹与知识库痕迹。
3. 验收语义：自报 ≠ 完成；只有主人确认才落定。
4. 机制优先于人工：发现流程缺口先修机制。
