---
title: 流程 D 研发编排链路（六件技能与双流程分工）
domain: methodology
source:
  origin: mattpocock/skills 十件原文精读（pin 49dd158d，2026-10-11 fetch 复核）+ 流程 D 技术方案
  ref: docs/designs/2026-10-10-流程D-研发编排-技术方案.md
confirmed: 2026-10-11
status: 待审核
owner: 主人
---

# 流程 D 研发编排链路（六件技能与双流程分工）

> 适用：研发执行类工作（规格→票→实现→评审→回顾）。**流程 K 管决策产出与知识，流程 D 管研发执行编排**——双流程共享同一套治理不变量与任务面契约（`principle/task-and-memory-surface.md`）。

## 链路映射表（六件 ↔ 上游件 ↔ 流程 K 落点 ↔ 改编要点）

| 本仓件 | 上游件（mattpocock/skills，pin 49dd158d，MIT） | 流程 K 落点 | 改编要点 |
|---|---|---|---|
| `grilling` | productivity/grilling | digest 第二步（需求拷问） | 对象扩为需求/方案/决策三类；3 轮上限；出口=登记不补全 |
| `spec-align` | engineering/grill-with-docs（组合 router）+ domain-modeling、to-spec 语义 | digest 需求包的互补件 | 规格六节中文模板；GLOSSARY 落本仓 meta；ADR 落目标项目 docs/adr |
| `ticket-split` | engineering/to-tickets | design 第七步（五规则拆解） | 五机制全保留；tracker 本仓常量化；删 GitHub/Linear/ready-for-agent 分支 |
| `impl-discipline` | engineering/tdd + diagnosing-bugs | implement 第三/四步 | 红绿循环+接缝预约定+诊断闭环合成单票纪律；脱敏红线保留 |
| `dual-axis-review` | engineering/code-review | review 实现评审双轴节 | 双轴协议独立化；纪律源本仓化（SKILL.md 纪律摘要）；smell 12 条全文随 brief |
| `retro` | engineering/retro | implement 第六步第 4 项 | 七类保留；落点本仓化（GLOSSARY/知识漂移/技能修订）；每会话收尾一问 |

不装件清单：wayfinder / triage / ask-matt / setup-matt-pocock-skills / teach / handoff / to-spec / implement-spec / pr / wizard / codebase-design 等其余上游件均不装（to-spec 语义并入 spec-align；implement-spec 的 ready-frontier 已在流程 K implement；pr 可逆性字段已在 adapters）。

## 双流程分工契约

- **流程 K（决策产出与知识）**：主人需求 → 需求包（digest）→ 方案（design）→ 评审（review）→ 落定 → 执行（implement）→ 回灌；
- **流程 D（研发执行编排）**：grilling → spec-align → ticket-split → impl-discipline → dual-axis-review → retro；
- **入口**：A=主人研发编排类需求直入流程 D；B=流程 K 落定方案从拆票转入（design 第七步装载 ticket-split）；C=单件直调（任意会话需要单件能力）；
- **出口（统一）**：自报（report/评审结论/建议清单）→ 主人 confirm 才落定（唯一落定门）。

| 流程 D 动作 | 任务面操作 | 治理语义 |
|---|---|---|
| grilling 分支裁决 | 无（会话内） | 决策归主人；3 轮上限→决策门（不静默） |
| spec-align 规格确认 | 无（会话内确认） | confirm 归主人；术语/ADR 走登记通道 |
| ticket-split 发布票 | `create` 立项 | quiz 批准=主人决策；立项≠交付 |
| impl-discipline 票完成 | `claim` → `report` | 自报≠完成；治理面→停+审批 |
| dual-axis-review 评审 | 评审结论（固定格式） | 评审≠通过门；规格轴逐条证据回源 |
| retro 建议清单 | 候选→确认后立项/入知识（待审核） | 不自行动环境 |
| 终态 | 主人 `confirm` | 唯一落定门 |

## 本仓化改写点

1. **tracker 常量化**：看板（dsh）/文件台账（omp）+ `blocked_by` 原生映射 + 任务面四态，替代上游 setup-matt-pocock-skills（常量节内嵌 spec-align 与 ticket-split 两件）；
2. **治理不变量操作化内嵌**：四条不变量（自报≠完成 / confirm 归主人 / 治理动作不静默 / 证据回源）逐件写「本技能语境的生效方式」，权威定义仍在 task-and-memory-surface 与流程 K 各 SKILL.md（单一事实源，不复制定义）；
3. **中文正文+中文出口**：技能正文中文由架构师读，对主人出口保持中文（流程指令与出口语言分离）；
4. **3 轮上限**：拷问轮次上限沿 digest Q3 先例，防问询失控；
5. **零供应链**：不 vendor 上游代码，仅方法论改编+出处标注（每件 SKILL.md 出处节带 pin）。

## 互引

- `principle/writing-for-agents.md`——技能写作纪律（完成判据两杠杆 / leading words / 渐进披露）；
- `principle/task-and-memory-surface.md`——任务面五操作+四态+四不变量（自报语义权威源）；
- `principle/coding-delegation-and-branch-discipline.md`——自编/委派点名制与分支纪律（impl-discipline 的治理外框）；
- `meta/glossary.md`——流程 D / 流程 K / 规格对齐 / 接缝（seam）/ 双轴评审 / 诊断闭环 六术语行。
