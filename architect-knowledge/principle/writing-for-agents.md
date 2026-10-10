---
title: 给 Agent 写文档的纪律（writing-for-agents 蒸馏）
domain: methodology
source:
  origin: mattpocock/skills（writing-for-agents SKILL.md 原文精读，独立评审实例重取核对；pin 49dd158d）
  ref: https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents
confirmed: 2026-10-10
status: 待审核
owner: 主人
---

# 给 Agent 写文档的纪律（writing-for-agents 蒸馏）

> 适用：SKILL.md、AGENTS.md、以及任何 agent 经指针到达的文档。与 `token-efficiency-and-human-feedback.md`（成本面）、`progressive-disclosure-four-layers.md`（装载面）、`ai-friendly-nine-points.md` 互引——本条目专管**文档结构学与判据设计**。

## 信息层级（三档）

1. **文内步骤**：agent 按序执行的动作（主层）；
2. **文内参考**：按需查阅的规则/事实——同层平铺是正常形态，非坏味道；
3. **指针后置参考**：推到独立文件、经上下文指针按需装载。

**渐进披露的本质是保护层级，不是省 token**。分支判据：所有分支都需要的内联，只有部分分支到达的才后置。**同置（co-location）**：一个概念的定义/规则/坑放在同一标题下。失败模式=**sprawl**（文档过长，注意力摊薄）。

## 两种预算

- **context load**：常驻上下文的每 turn 成本（AGENTS.md 行、技能 description）——指针的措辞比目标文件更决定触发可靠性；
- **cognitive load**：人的心智索引成本——不是要最小化，是该花在人类判断处。

## 完成判据两杠杆

- **Clarity**：agent 能否分辨 done/not-done——防 premature completion；防法：先磨锐边界，再考虑拆分隐藏后续步骤；
- **Demand**：判据要求多彻底（「每个被改的模型都有着落」强于「产出变更清单」）——**最强判据=可检查且穷尽**。

## Leading words 与否定式失败

- 用模型预训练已有的紧概念锚定行为（`红灯`、`曳光弹`、`就绪边界`）——一词替一段，招来模型已有先验；自造词要先付定义成本；
- **否定式是失败模式**：「别想大象」会让大象占满注意力——提示**正向**目标行为；禁令仅保留给无法正向表述的硬护栏（如治理红线），且与正向目标成对出现。

## Pruning 四则

1. **单一事实源**：一个含义一处权威；重复=维护成本+注意力虚高（与 leading words 的「故意重复 token」相反）；
2. **环境即事实源**：`package.json`/`--help`/目录结构能查到的不写进文档——文档只缓存「查不到的」：未成文惯例、选择背后的理由、没人坦白的坑；
3. **相关性逐句查**：与文档所做之事不再相关的行删掉；默认命运是 **sediment**（陈旧层沉积）；
4. **猎杀 no-ops**：模型默认就遵守的指令付 load 说空话——判据是模型相对的（跑一遍文档验证是否改变行为）。

## 本仓落点

- **L4 改造审计判据**：现有 4×architect SKILL.md 与 AGENTS.md 逐条过上述检查（2026-10-10 起分批，见 docs/designs/2026-10-10-编排流程吸收整合-技术方案.md）；
- 工具定义规则（删模型可从结果学到的约束/行为非实现/参数规则放参数上/每事实只说一次/度量变更）见 DSH 内置技能 `agent-experience`——两者互补。
