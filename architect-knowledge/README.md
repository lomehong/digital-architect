# architect-knowledge · 架构师知识库

> 知识工程目录。以领域为边界，蒸馏架构师大脑——方法论出处：《架构师 Agent 系统化落地》§business-knowledge（dsh-memory 条目 `mem_1788978083156_yycfzp`）。
> **首个领域 = dsh 生态自身**（自举：宪章 = Architecture Map，各仓 README = System Card 素材，两篇文章 = 方法论基座）。

## 为什么是固定结构而不是 RAG

**固定结构 = 知识覆盖约束**——它告诉 AI 必须理解什么；RAG 只告诉 AI 可能有相关资料。RAG 三问题（颗粒度不一致 / 语义相似≠工程相关 / TopK 无结构性保证）决定了第一层是领域化的结构索引，检索只是扩展能力。

## 五类结构

| 目录 | 装什么 | 回答的问题 |
|---|---|---|
| `meta/` | 业务元语、核心对象、别名、非同义词、边界、项目决策 | 这个领域的基本概念和边界是什么 |
| `principle/` | 幂等、一致性、超时、兼容、降级等跨场景原则；方法论原则 | 跨场景不变的规则是什么 |
| `scenario/` | 业务场景 → API/服务/数据/消息/异常/补偿 的映射 | 一个场景如何落成技术动作 |
| `practice/` | 历史决策、事故教训、兼容原因、可复用模式 | 为什么会是这样（历史原因） |
| `reference/` | 与其他领域的关系和契约（**引用不复制**对方知识） | 领域边界外去找谁 |

## 条目格式（每条知识必须带）

每个条目一个 markdown 文件，文件头用 YAML frontmatter：

```yaml
---
title: 条目标题
domain: dsh-ecosystem        # 所属领域（首个领域：dsh-ecosystem / methodology）
source:
  origin: 来源名              # 如 digital-twin/docs/suite-charter.md、dsh-memory 条目 ID
  ref: 具体章节或 URL
confirmed: 2026-09-09        # 最后确认时间
status: 已确认               # 已确认 | 待审核（未确认内容必须标待审核，不得静默升级为事实）
owner: 主人                  # 负责人
---
```

正文：只写事实与结论，写清「适用范围」；与代码可能冲突的行为类知识必须注明「以代码为准」的核对路径。

## 维护机制（知识最大风险 = 过期后「看似可信地误导 AI」）

- **日常增量**：关键 API/链路/规则变化时触发蒸馏，新增条目先标 `status: 待审核`，经确认后升级。
- **周期校准**：阶段性复盘资料蒸馏补高风险知识。
- **知识漂移**：实证与知识冲突时，先修方案再回写知识（案例见 `practice/knowledge-drift-cases.md`）。
- **不同事实回不同来源确认**：当前行为以代码为准、业务意图以已确认知识为准、历史原因以实践记录为准。

## 检索路径（渐进式披露）

SKILL 按「业务层 → 架构层 → 系统层 → 基建层」四层顺序装载本库（见 `principle/progressive-disclosure-four-layers.md`）；`meta/` 常读，`reference/` 只在跨领域时打开。
