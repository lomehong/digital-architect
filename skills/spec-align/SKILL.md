---
name: spec-align
description: 规格对齐——把已讨论的对话收敛成可拆票的研发规格（用户故事级六节模板）+ quiz 触碰模块与接缝确认 + GLOSSARY/ADR 内联维护；流程 D 链路第二环，接在拷问之后、拆票之前。
whenToUse: 对话已对齐、需要「出规格」「规格化」「收敛成可拆票文件」时使用；流程 D 链路第二环（grilling 之后、ticket-split 之前）；与 architect-prd-digest 需求包互补不替代。
---

# spec-align · 规格对齐

你承担**规格对齐**职能：把已讨论的对话收敛成可拆票的研发规格，并在过程中内联维护统一语言（GLOSSARY）与决策记录（ADR）。

## 输入

- 一段已讨论的对话 / 一份草稿需求 / 一棵已拷问闭合的设计树（`grilling` 产出）；
- 目标项目上下文（规格涉及既有模块时）。

## 流程

### ⓐ 规格收敛

按中文结构模板成文，六节齐全：

1. **问题陈述**：要解决什么，为什么现在解决；
2. **方案**：选定路线一句话 + 关键取舍；
3. **用户故事**：编号，每条 As an / I want / so that；
4. **实现决策**：已定项（含明确不做的方式）；
5. **测试决策**：怎么验证（可观察行为级）；
6. **不做项**：显式排除清单（与本仓需求包「不做项」节同构）。

节外开放性备注不设（上游 to-spec 的 Further Notes 节省略——开放问题由待确认登记承担，不进规格正文）。

### ⓑ quiz 触碰模块

列出规格将触碰的模块与测试接缝（seam）：接缝尽量复用既有、接缝总数趋少；编号清单呈主人确认。主人对某条接缝有异议 → 回 ⓐ 修订规格后再确认。

### ⓒ GLOSSARY 内联维护

过程中新增或锐化的术语即时写入 `architect-knowledge/meta/glossary.md`（一行索引+权威定义指针），随做随落，不批量补。

### ⓓ ADR 判据

**三条件全中**才立 ADR（落目标项目 `docs/adr/`）：①难逆；②无上下文的人会惊讶；③真实取舍（存在被放弃的备选）。任一不满足 → 不立，决策留在规格「实现决策」节即可。

### 完成判据（两杠杆）

- **Clarity**：规格六节齐全，触碰模块/接缝清单**经主人确认**；
- **Demand**：每条用户故事可验收（有可观察行为）+ 新术语零积压（全部落 GLOSSARY）。

## 本仓 tracker 常量（替代上游 setup-matt-pocock-skills）

- tracker：任务面=看板任务工具（dsh）/ `scripts/task-ledger.mjs` 文件台账（omp），契约：`architect-knowledge/principle/task-and-memory-surface.md`；
- 阻断边：看板原生 `blocked_by` 字段（台账=票头 Blocked by 行）；
- 状态：任务面四态（待执行/执行中/待确认/已落定，对照契约状态机）；上游 ready-for-agent 标签不引入；
- 文档落点：目标项目 `docs/designs/`（方案与规格）/ 契约指定任务记录落点。

## 治理不变量（本技能语境的操作化；权威定义见 `architect-knowledge/principle/task-and-memory-surface.md` 与流程 K 各 SKILL.md）

| 不变量 | 在本技能中的生效方式 |
|---|---|
| 自报 ≠ 完成 | 规格经主人确认 ≠ 可跳过拆票与实现；规格只是研发执行文件的起点 |
| confirm 归主人 | 规格正文与触碰模块清单均经主人确认后才算收敛 |
| 治理动作不静默 | 术语/ADR 变更走登记通道（GLOSSARY / 目标项目 `docs/adr/`），不静默改知识库 |
| 证据回源 | 规格每节条目回源对话或文档（主人原话 / 查证输出 / 引用文件），不凭空增删范围 |

## 与流程 K 的衔接

- 流程 D 链路第二环：`grilling` 之后、`ticket-split` 之前；
- 与流程 K `architect-prd-digest` 的区别：需求包=准入文件（范围受控），规格=研发执行文件（用户故事级）——互补不替代；digest 产出需求包后，主人要求规格化时调用本件。

## 出处

- 方法论上游：mattpocock/skills `skills/engineering/grill-with-docs`（组合 router：调用 grilling + domain-modeling，MIT），pin `49dd158d1076134a641b33efb035946536778336`——https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/engineering/grill-with-docs
- 另吸收 to-spec 模板语义（Further Notes 节省略及理由见上）。本件为中文本地化改编：GLOSSARY 落点本仓化、ADR 落目标项目、tracker 本仓常量节替代上游 setup 件。未安装上游原版件，零供应链引入。改编依据：`docs/designs/2026-10-10-流程D-研发编排-技术方案.md` §2.2。
