---
title: 架构推理 Agent Runtime 五层结构
domain: methodology
source:
  origin: 公众号《【AI 创新实践】"架构师 Agent" 系统化落地》（原文页浏览器快照 + AI星球镜像全文交叉核对，2026-09-10 二次蒸馏——文章后半部增补）
  ref: https://mp.weixin.qq.com/s/Yj96bBD7LLhq_U1THdke8A §6.3/§6.4；镜像 https://www.aixq.cc/65600.html
confirmed: 2026-09-10
status: 待审核
owner: 主人
---

# 架构推理 Agent Runtime 五层结构

> 与 `progressive-disclosure-four-layers.md`（四层装载）互补：**四层是知识装载顺序，五层是能力面**——Runtime 由哪些能力层构成。

## 五层（自顶向下）

| 层 | 能力 | 解决什么 |
|---|---|---|
| a 业务理解层 | KBase MCP（结构化业务知识访问） | 设计前是否理解需求背后的业务语义与领域上下文 |
| b 系统分析层 | AITOM（API 检索 / 调用关系 / 链路追踪） | 从入口探索真实链路与上下游，强于单仓 grep |
| c 架构推理层 | 技术方案设计 Skill | 固化工作方式：需求分析→分层加载→定位→覆盖验证 |
| d 服务知识层 | 各微服务 Service Knowledge | 服务级职责/契约/数据模型/依赖 |
| e 事实验证层 | Git Repository Code Context | 实现事实最终回源 |

## Runtime 语义

- Runtime **不是预加载所有知识的大 Prompt**，而是「发现问题 → 判断当前缺什么 → 定位信息来源 → 按需加载 → 更新上下文 → 继续推理」的动态运行环境；
- 目标不是让 Agent 知道所有信息，而是**沿最短认知路径获得当前架构决策必需的上下文与证据**。

## 人类角色转变（§6.4）

「纯 AI 做技术方案设计」= 调研/检索/链路推理/代码核查/文档生成/覆盖检查由 AI 独立完成；出现业务取舍、跨团队接口承诺、数据口径、合规或高风险授权时，AI 停止猜测发起明确提问。**人从「替 AI 收集所有资料」转为「裁决事实缺口和承担关键决策」——人不再是系统知识的唯一检索器，而是知识质量和决策权的最终负责人。**

## 三支柱分工

Skill 固化稳定流程/输入输出/边界；Harness 组织上下文/工具调用/停止条件/证据校验/验证闭环；基础模型负责推理、规划与动态编排。只靠模型易漏稳定约束，只靠流程易锁死模型能力，只靠文档难保证被正确加载。

## 本仓落点（适用范围）

自举领域（dsh 生态）的五层对应：业务理解=本知识库 meta/scenario；系统分析=`reference/dsh-suite-architecture-map.md` + 宪章矩阵；架构推理=三 SKILL；服务知识=各仓 README/System Card（service-knowledge 试点待 P1-2）；事实验证=各仓源码 + 官方 checkout。**KBase MCP / AITOM 显式不建**（母包 `docs/designs/2026-09-10-架构师Agent优化-需求包.md` §1.3）。
