---
name: dual-axis-review
description: 双轴评审——沿标准轴（纪律+smell 基线）与规格轴（对照规格逐条核）并行子代理评审 diff，分轴呈现永不合并排序；基准点钉定+规格源探测+子代理不可用降级路径；规格轴 findings 逐条证据回源。
whenToUse: 有一段 diff 需要「评审」「双轴评审」「对照规格核实现」时使用；任何 diff 皆可独立调用；流程 D 链路第五环；流程 K review 实现评审模式的双轴按本件执行。
---

# dual-axis-review · 双轴子代理评审

你承担**双轴评审**职能：沿标准轴与规格轴并行评审 diff，分轴呈现、永不合并排序——轴分离的存在理由就是防止一轴掩盖另一轴。

## 输入

- 待评审 diff；
- 固定基准点（commit/branch/tag/merge-base，由发起人指定）；
- 规格来源（方案/规格/票，可缺省——见 ⓑ 规格源探测）。

## 流程

### ⓐ 钉基准点

发起人指定基准点；一次捕获 `git diff <基准>...HEAD`（三点）+ 提交清单。**基准不可解析或空 diff → 就地失败**，不带病进子代理。

### ⓑ 找规格源

按序探测：①提交信息引用 → ②发起人传入 → ③目标项目 `docs/specs/` 下按分支名匹配 → ④问发起人。确认无规格 → 规格轴跳过，报告注明「no spec available」。

### ⓒ 找纪律源

- 本仓：相关 SKILL.md 纪律摘要+红线；目标项目：其 AGENTS.md/贡献指南；
- smell 基线 12 条**全文随 brief 携带**（见下节）；
- 绑定规则两条：仓库纪律**覆盖**基线；smell 全部是 judgement call 非硬违规；工具已强制的跳过。

### ⓓ 并行派发

标准轴/规格轴各派一个子代理。brief 纪律：完整判据 + diff 范围 + 输出格式（分轴 / 引原文 / 区分硬违规与 judgement call / ≤400 字）。**子代理不可用 → 降级单代理双轴串行**（沿流程 K review 既有设计）。

### ⓔ 聚合

分轴呈现、每轴一行总结放报告尾、**永不跨轴 rerank**。

### 完成判据（两杠杆）

- **Clarity**：两轴产出齐全（缺席轴已注明）+ 每轴一行总结在报告尾；
- **Demand**：规格轴 findings **逐条证据回源后才成立**（引规格原文+引 diff 位置），未回源不计入。

## smell 基线（Fowler 12 条，随 brief 携带；judgement call 非硬违规）

| # | smell | 是什么 → 怎么改 |
|---|---|---|
| 1 | Mysterious Name | 名字要靠读实现才懂 → 改为能自解释的名字 |
| 2 | Duplicated Code | 同样逻辑多处出现 → 提取为单一实现再引用 |
| 3 | Feature Envy | 函数总在用别的模块的数据 → 把函数搬去和数据同住 |
| 4 | Data Clumps | 几个数据总结伴出现 → 聚成对象/参数对象 |
| 5 | Primitive Obsession | 领域概念用裸基本类型装 → 建领域类型/值对象 |
| 6 | Repeated Switches | 同一条件分支散布多处 → 多态/查表/映射收敛 |
| 7 | Shotgun Surgery | 一处改动要同步改许多处 → 收拢变化点 |
| 8 | Divergent Change | 一个模块因多种原因被改 → 按变化方向拆分 |
| 9 | Speculative Generality | 为 imagined 需求预留的抽象 → 删到只剩当下所需 |
| 10 | Message Chains | a.getB().getC().doX() 长链 → 封装委托/中间方法 |
| 11 | Middle Man | 类几乎只转发请求 → 让调用方直连或删掉中间层 |
| 12 | Refused Bequest | 子类拒用并绕开父类遗产 → 组合替代继承/重排层级 |

## 治理不变量（本技能语境的操作化；权威定义见 `architect-knowledge/principle/task-and-memory-surface.md` 与流程 K 各 SKILL.md）

| 不变量 | 在本技能中的生效方式 |
|---|---|
| 自报 ≠ 完成 | 评审通过 ≠ 落定；合并/发布仍须主人 confirm |
| confirm 归主人 | 评审结论呈主人确认；本件只产结论不做处置 |
| 治理动作不静默 | findings 未回源不成立，不静默计入；缺席轴显式注明而非略过 |
| 证据回源 | 规格轴逐条回源（引规格原文+引 diff 位置）；标准轴引纪律原文 |

## 与流程 K 的衔接

- 流程 K `architect-review` 实现评审模式的双轴按本技能执行（本节聚合纪律与其同源）；
- 独立可调用：任何 diff 评审；流程 D 链路第五环（`impl-discipline` 之后、`retro` 之前）。

## 出处

- 方法论上游：mattpocock/skills `skills/engineering/code-review`（双轴并行子代理+smell 基线 12 条+永不 rerank，MIT），pin `49dd158d1076134a641b33efb035946536778336`——https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/engineering/code-review
- 本件为中文本地化改编：双轴定义/绑定规则/派发/聚合沉淀为独立技能；纪律源本仓化（SKILL.md 纪律摘要替代上游 CODING_STANDARDS.md 探测）；规格轴证据回源不变量。未安装上游原版件，零供应链引入。改编依据：`docs/designs/2026-10-10-流程D-研发编排-技术方案.md` §2.5。
