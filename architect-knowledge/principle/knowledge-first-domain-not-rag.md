---
title: 知识库第一层是领域结构，不是 RAG
domain: methodology
source:
  origin: dsh-memory 条目 mem_1788978083156_yycfzp（千问AI平台《架构师 Agent 系统化落地》）
  ref: §知识库第一层不是 RAG 而是领域 / §business-knowledge / §service-knowledge
confirmed: 2026-09-09
status: 已确认
owner: 主人
---

# 知识库第一层是领域结构，不是 RAG

## RAG 三问题（为什么不能只靠检索）

1. **颗粒度不一致**：知识密度差异大，检索出的块时详时略。
2. **语义相似 ≠ 工程相关**：找不到「状态机不可跳转」类硬约束。
3. **TopK 无完整性结构性保证**：返回碎片而非链路。

## 第一性原理

**知识有结构应结构化索引；信息类内容（新闻）才适合平铺检索。** 固定结构 = 知识覆盖约束（告诉 AI 必须理解什么）；RAG 只告诉可能有相关资料——骨架立起来，检索才是扩展能力。

## business-knowledge 五类结构（以领域为边界，蒸馏架构师大脑）

| 类 | 内容 |
|---|---|
| `meta/` | 业务元语、核心对象、别名、非同义词、边界 |
| `principle/` | 幂等、一致性、超时、兼容、降级等跨场景原则 |
| `scenario/` | 业务场景 → API/服务/数据/消息/异常/补偿 的映射 |
| `practice/` | 历史决策、事故教训、兼容原因、可复用模式 |
| `reference/` | 与其他领域的关系和契约（**不复制**对方知识） |

来源工艺：从方案/串讲文档蒸馏（skill: business-knowledge-distill，含图片分析）。

## service-knowledge 三重价值（系统层知识）

1. **code indexing**：5 万行以上代码理解效率差一个数量级。
2. **实体与逻辑预抽取**：省重复分析、省 token。
3. **多微服务场景**：高密度知识避免 context 压缩导致的信息丢失。

与代码同 repo 非必须（可用 Harness 关联）；YAML 比 markdown 结构性强、信息密度高；git hook / coding agent hook 保证增量一致性。

## 对本知识库的直接约束

`architect-knowledge/` 的五类目录即按此结构设立；条目格式（来源/确认时间/适用范围/状态/负责人）是维护红线的落地，见 `../README.md`。
