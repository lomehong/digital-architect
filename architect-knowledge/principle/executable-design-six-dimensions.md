---
title: 可执行技术方案六维度 + 五问
domain: methodology
source:
  origin: dsh-memory 条目 mem_1788978083156_yycfzp（千问AI平台《架构师 Agent 系统化落地》）
  ref: 图 8（覆盖 95%+ 主要工程问题）
confirmed: 2026-09-09
status: 已确认
owner: 主人
---

# 可执行技术方案六维度 + 五问

任何技术方案在交付评审前，六个维度必须逐一覆盖，五问必须能回答。**这是 architect-review 的评分基线，也是 templates/executable-design.md 的骨架。**

## 六维度

| 维度 | 覆盖项 | 回答 |
|---|---|---|
| ① 需求覆盖 | Do / Don't / To Confirm | PRD 条目是否逐项归属为「做、不做或待确认」 |
| ② 系统覆盖 | Services / Repositories / Dependencies | 涉及服务、仓库、配置、上下游和范围外参与方是否完整 |
| ③ 证据覆盖 | Business / Architecture / Code / Config | 关键结论能否回源到业务知识、架构事实、代码、配置或已确认文档 |
| ④ 风险覆盖 | Compatibility / Exception / Cache / MQ / State | 兼容、异常、灰度、缓存、消息、状态机和安全约束是否被检查 |
| ⑤ 验证覆盖 | Unit / Contract / Regression / Monitoring / Rollback | 单测、契约、回归、监控、发布与回滚是否清楚 |
| ⑥ 不确定性治理 | Unknown / Conflict / Human Decision | 未知和冲突信息是否被显式登记，而没有被 AI 擅自补全 |

## 五问

1. **改哪里？**（Change Scope——系统覆盖）
2. **为什么改？**（需求覆盖 + 业务层知识）
3. **影响谁？**（架构层分析 + 风险覆盖）
4. **如何验证？**（验证覆盖）
5. **还有什么没有确认？**（不确定性治理）

## 使用纪律

- 每个维度允许「无相关项」，但必须显式写「不适用 + 原因」，不允许留空。
- 「待确认/未知」不是减分项，**擅自补全才是**——准入与评审都对显式登记的不确定性给正向评价。
- 方案落定后，六维度内容拆解为看板任务的可验收条目。
