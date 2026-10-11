---
name: ticket-split
description: 拆票——把规格或落定方案拆成曳光弹票集：垂直切片+阻断边显式（blocked_by）+expand–contract 例外+quiz 迭代至批准，发布到本仓看板/台账；立项≠交付。
whenToUse: 规格（spec-align 产出）或已落定方案需要「拆票」「拆任务」「立项到看板」时使用；流程 D 链路第三环（→ impl-discipline）；流程 K design 第七步拆解可装载本件执行。
---

# ticket-split · 拆票

你承担**拆票**职能：把规格或已落定方案拆成可并发执行的曳光弹票集——阻断边显式、每票可独立验收，发布至本仓 tracker。

## 输入

- 已确认规格（`spec-align` 产出）或已落定方案（流程 K design 产出）；
- 可选：目标项目代码库上下文（探代码与切片定位用）。

## 流程

### ⓐ 集上下文

对话中已有的上下文优先；引用的外部材料取全文——不凭转述拆票。

### ⓑ 探代码（可选）

规格涉及既有代码时读相关模块，识别预重构机会——「先让改动变容易，再做容易的改动」；预重构**单独成票**，不与功能票混合。

### ⓒ 曳光弹切片

每票切穿所有层、可独立验收（有端到端行为描述）、单会话上下文可容；不做单层横切片。

### ⓓ 阻断边显式

每票声明 `blocked_by`（映射本仓 tracker 常量节的看板原生字段）；无依赖的票留空，不虚构依赖。

### ⓔ expand–contract 例外

宽改（爆炸半径遍布全库的机械变更）不硬切垂直片，走三段式：**扩展**（新旧并存）→ **分批迁移**（每批一票，保 CI 绿）→ **收缩**（删旧形式，`blocked_by` 全部批次）；批间无法独立保绿时共享集成分支、汇入最终验证票。

### ⓕ quiz 迭代

把票集整理成编号清单呈主人：粒度粗细（该合该拆）、阻断边正确性、票面可验收性——迭代至主人批准。**拆解未经批准不发布**。

### ⓖ 发布

经本仓 tracker 常量节发布：任务面 `create` 立项（任务号+标题+可验收条目+阻断边）。防陈旧规则：票内不写会过时的文件路径；决策性片段（schema/状态机/类型形状）可内联并注明出处。

### 完成判据（两杠杆）

- **Clarity**：每票可独立验收（有端到端行为描述）且 `blocked_by` 经 quiz 确认；
- **Demand**：每条 Do/用户故事**恰好归属一张票**（不重不漏）+ 票内零过时路径。

## 本仓 tracker 常量（替代上游 setup-matt-pocock-skills）

- tracker：任务面=看板任务工具（dsh）/ `scripts/task-ledger.mjs` 文件台账（omp），契约：`architect-knowledge/principle/task-and-memory-surface.md`；
- 阻断边：看板原生 `blocked_by` 字段（台账=票头 Blocked by 行）；
- 状态：任务面四态（待执行/执行中/待确认/已落定，对照契约状态机）；上游 ready-for-agent 标签不引入；
- 文档落点：目标项目 `docs/designs/`（方案与规格）/ 契约指定任务记录落点。

## 治理不变量（本技能语境的操作化；权威定义见 `architect-knowledge/principle/task-and-memory-surface.md` 与流程 K 各 SKILL.md）

| 不变量 | 在本技能中的生效方式 |
|---|---|
| 自报 ≠ 完成 | 发布看板=立项，不是交付；票到达执行方后仍走 claim→report→confirm 全程 |
| confirm 归主人 | quiz 拆解批准=主人决策；未经批准不发布 |
| 治理动作不静默 | `blocked_by` 不得静默省略；票面与方案的偏离处显式注明 |
| 证据回源 | 决策性片段注明出处（方案节号 / 规格条目 / 对话依据） |

## 与流程 K 的衔接

- 流程 K `architect-design` 第七步拆解可装载本技能执行（五规则与本件同源，本件含完整 quiz 协议与本仓 tracker 常量节）；
- 流程 D 链路第三环：`spec-align` 之后（→ `impl-discipline`）。

## 出处

- 方法论上游：mattpocock/skills `skills/engineering/to-tickets`（MIT），pin `49dd158d1076134a641b33efb035946536778336`——https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/engineering/to-tickets
- 本件为中文本地化改编：五机制全保留（曳光弹/阻断边/expand–contract/quiz/防陈旧）；tracker 本仓常量化，删除 GitHub/Linear/ready-for-agent 标签分支与 setup 依赖。未安装上游原版件，零供应链引入。改编依据：`docs/designs/2026-10-10-流程D-研发编排-技术方案.md` §2.3。
