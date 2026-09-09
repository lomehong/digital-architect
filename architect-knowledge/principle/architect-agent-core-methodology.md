---
title: 架构师 Agent 核心方法论（Context Gap / 断裂知识 / 三支柱）
domain: methodology
source:
  origin: dsh-memory 条目 mem_1788978083156_yycfzp（千问AI平台《架构师 Agent 系统化落地》，刘瑞洲/阳迪，2026-09-09）
  ref: https://mp.weixin.qq.com/s/Yj96bBD7LLhq_U1THdke8A（含 8 张图多模态解读）
confirmed: 2026-09-09
status: 已确认
owner: 主人
---

# 架构师 Agent 核心方法论

## 痛点模型：局部正确、整体错误

AI 在复杂存量系统的典型错误不是「写错代码」而是「**局部正确、整体错误**」：

- 逻辑写错服务；同步调用消耗核心链路超时预算；删兼容逻辑破坏下游。
- 典型案例（图 3）：①删除看似无用字段 → 破坏离线任务依赖；②新增同步 RPC → 消耗核心链路超时预算；③修改 MQ 语义 → 影响历史消费者。
- **根源**：关键知识不在代码里，散落于历史方案、事故复盘、配置平台、同事经验与未成文约定。

## Context Gap（图 1）

AI 只看 Code/Config/当前服务 = Partial Context + Local Understanding。Context Gap 中对 AI 不可见的是：Infrastructure Rules、Service Dependencies、Hidden Constraints、Historical Context、Runtime Reality。**代码能解释现实，架构才能支撑判断**——系统理解必须被工程化建设。

## 四类断裂知识

| 类别 | 断裂表现 |
|---|---|
| 业务知识 | 业务语言 ≠ 代码命名（「订单」一词多义） |
| 架构知识 | 链路、数据主责、一致性边界 |
| 服务内部知识 | 契约、状态机、主路径 vs 历史兼容 |
| 工程组织知识 | 超时、灰度、发布、回滚 |

## 业界三路线与本项目的定位

- Spec-Driven（GitHub Spec Kit / Kiro）：Spec→Plan→Tasks→Implement。
- 长程 Agent Harness（Anthropic）：初始化/任务拆分/结构化交接。
- Agent-friendly Repo（OpenAI）：AGENTS.md 路由 + 结构化文档 + CI 发现知识漂移。
- **均偏单服务内部；跨复杂多系统的工业实践是空白——即本项目的定位。**

## 新系统 vs 存量系统（图 2）

新系统 = Clean Slate（PRD→API→Service→Database→Code 线性推进）；存量系统 = Complex System（多服务 + legacy compat + MySQL/Redis/MQ + Config Center + Log/Trace）。存量系统的 AI 理解需要六类知识输入：Business / Architecture / Service Knowledge、Code & Config、Historical Practice、Constraints。认知路径 = Code Understanding → System Understanding → Reasoning → Verifiable Technical Design。

## 三支柱

**Skill（稳定流程）+ Harness（上下文/工具/停止条件/证据校验）+ Foundation Model（推理/动态编排）**。「纯 AI 做技术方案设计」= 调研/检索/链路推理/代码核查/文档生成/覆盖检查由 AI 独立完成，**不等于取消人的职责**。

## 知识维护红线

知识最大风险是过期后「**看似可信地误导 AI**」。两类互补：日常增量（关键变化触发蒸馏，未确认内容标待审核不静默升级为事实）+ 周期校准。每条重要知识带**来源/最后确认时间/适用范围/状态/负责人**。

## 人工决策介入点（图 4/7）

业务取舍 / 高风险变更 / 异常情况；细分为六类门：Unknown / Conflict / Business Trade-off / Cross-team Commitment / Compliance / High-risk Change。
