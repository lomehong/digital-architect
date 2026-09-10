---
title: service-knowledge 蒸馏试点教训（委托-把关模式 / 字节指标结论 / 蒸馏即漂移探测）
domain: dsh-ecosystem
source:
  origin: digital-architect 执行实证（2026-09-10 三仓试点，提交 c1aef7d~5cd62cd）
  ref: docs/designs/2026-09-10-service-knowledge三仓试点-走查记录.md
confirmed: 2026-09-10
status: 待审核
owner: 主人
---

# service-knowledge 蒸馏试点教训

## 教训一：委托-把关模式（大规模读源蒸馏的有效形态）

- 三个并行子代理各自通读一仓（含跨仓 grep 核实 consumed_by），父会话**每仓抽 3 处 source 亲自回源**后才落盘——9/9 通过、零编造；
- 关键任务书纪律：**「宁可少写不可编造，无法回源的事实直接不写」+ 未知集中进 gaps**——三个子代理均主动纠正了任务书线索偏差（task-board：ledger/memory 实为被消费方；memory：noteActor 属 twin；twin：PRESET_VERSION 以代码为准），说明纪律条款真实生效；
- 适用范围：一切超过单会话上下文舒适区的读源蒸馏/盘点任务。

## 教训二：字节指标在小规模不成立（诚实结论）

- 试点实测：知识路径 33,372 字节 = 三仓 README 总量（20,416 字节）的 **163.5%**——本规模下 token 节约**不成立**；
- 真实收益 = 跨仓 `consumed_by` 逐符号映射（README 不含）+ 结构可机械校验 + 安改红线内联；
- **铺开判据据此修正：按需蒸馏高频改动仓，不做全量铺开**；文章 §5.5 的数量级收益前提（>5 万行×多服务）在本仓暂未达到。

## 教训三：蒸馏走查本身就是知识漂移探测器

- 一次三仓蒸馏顺带发现 **4 处文档-代码矛盾**（memory README 旧路径、twin README 版本与「不挂 shell/fs」漂移、noteActor 注释 vs fail-closed 实现、deliverReach 注释 vs 实现）+ **1 处安全疑点**（openloop/close 无 token 门禁）；
- 对应文章 §5.4「周期性校准」：**蒸馏动作应纳入漂移扫描触发器**——每次为某仓建/更新知识面时，强制对照其 README/注释与实现，冲突登记（处置公式见 `knowledge-drift-cases.md`：先修方案再回写知识）。

## 适用范围

本仓及套件各仓的知识蒸馏、盘点、走查类任务；铺开决策（其余 7 仓）按教训二判据执行。
