# digital-architect · 架构师 Agent

> 让大型存量分布式系统成为 AI 可理解、可推理、可验证的工程系统，使 AI Agent 能完成**技术方案设计**（架构师核心职能）。
> 第一个落地区域：我们自己的数字分身套件与 dsh 宿主（自举——知识源全在手边）。

## 一句话

基于**数字分身套件已有的 Harness 机制**（任务看板/账本治理/共享记忆/守卫纪律/验收语义）+ **两篇方法论文章**（阿里技术《AI Friendly 后端架构》与千问平台《架构师 Agent 系统化落地》），搭建架构师 Agent。**架构师 Agent ≠ 从零写新 Agent**：分身已有的 Harness 不动，补三个新件——知识工程（`architect-knowledge/`）、三个流程 SKILL（`skills/`）、产出规范（`templates/`）。

## 目录结构

```
digital-architect\
├── docs\HANDOFF.md                 ← 交接文档（唯一上下文来源，含方法论蒸馏 §3 与执行清单 §6）
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

## 路线

- **阶段 1（当前）**：知识工程地基——纯文件，零代码。
- **阶段 2**：自举首跑——对分身发起「基于数字分身套件现状，设计知识库体系的技术方案」，验证 prd-digest → design → review 全流程。
- **阶段 3**：工具化——验证有效后拍板 dsh-architect 插件（结构化工具 + 看板联动 + 覆盖检查自动化）。
- **阶段 4**：扩展——service-knowledge 生成、公众号管道对接。

详见 `docs\HANDOFF.md` §6。

## 纪律（主人叮嘱，见 HANDOFF §9）

1. 角色纪律：执行会话自报、主人确认——任何会话不代劳别人的角色动作。
2. 一切知识进结构：工作必须有看板痕迹与知识库痕迹。
3. 验收语义：自报 ≠ 完成；只有主人确认才落定。
4. 机制优先于人工：发现流程缺口先修机制。
