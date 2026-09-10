---
title: 宿主适配：dsh（DeepSeek Harness / digital-twin 套件）
domain: dsh-ecosystem
source:
  origin: digital-architect/docs/HANDOFF.md + architect-knowledge/scenario/architect-design-pipeline.md
  ref: 决策 D4-D8；首跑实证（docs/designs/）
confirmed: 2026-09-10
status: 已确认
owner: 主人
---

# 宿主适配：dsh

> 本文是 SKILL 在 dsh 宿主上的五面映射。分身 = 执行 Harness，SKILL = 流程（决策 D4）。

## 判别特征（任一命中即 dsh 宿主）

会话工具面出现以下任一项：`ask_user`、`task_delegate` / `task_claim` / `task_report`、
账本审批（今日待办 / approvals）、`read` 之外另有 memory 读写工具。
环境特征：DSH_HOME 家目录、web 会话（默认端口 3088）。

## 决策门映射

| 门 | dsh 落地 |
|---|---|
| Unknown（未知） | `ask_user` 会话内提问 |
| Conflict（知识/事实冲突） | `ask_user` + 按事实类型回对应来源核对（代码/已确认知识/实践记录） |
| Business Trade-off（业务取舍） | `ask_user`，带倾向建议与理由，主人拍板 |
| Cross-team Commitment（跨团队/跨会话承诺） | 看板派发 + 御驿协同 |
| Compliance（合规） | 账本 L2+ 审批（3 分钟令牌 + 今日待办批准 + 30 天授权） |
| High-risk Change（高风险变更） | 账本 L2/L3 拦截，强制人工审批 |

## 任务执行

- 方案落定后：`task_delegate` 立项（任务描述含可验收条目，附方案路径）→ 执行会话 `task_claim` 认领 → 干活 → `task_report` 自报；
- **验收语义**：自报 ≠ 完成——进「待确认」，主人在今日待办确认/驳回后才落定终态；
- 会话压缩后 session id 变化由看板接管语义处理，任务绑定不依赖固定 session id。

## 记忆沉淀

- 已验证结果（主人确认后）沉淀 dsh-memory（`POST /dsh-memory/entries`，`x-memory-token`；替代语义更新不覆盖历史）；
- 经验/教训回灌本仓库 `architect-knowledge/practice/`（git 管理，条目格式见知识库 README）；
- 人格/任务/记忆语义查 dsh-memory 与宪章，工程架构事实查本知识库（边界见 meta 概念模型）。

## 挂载与工具

- **SKILL 挂载**：技能发现根（dsh-skill-filesystem，深度一层）：`<projectRoot>/.dsh/skills`（rank 100）、`$DSH_HOME/skills`（rank 400）等；挂载 = 把本仓库 `skills/<name>/` 以 junction/link 接入被扫描根目录；frontmatter 必填 `name`（kebab-case）+ `description`。
- **检查工具**：dsh-architect 插件（`@dsh-extra/dsh-architect`）：主插件行注册 `dsh-architect` 服务；模型工具行 `@dsh-extra/dsh-architect/tools` 在 agent 预设插件列表追加（条件装配——装了才有行）。工具：`architect_digest` / `architect_design` / `architect_review`。
- **降级面**：检查工具缺席 → SKILL 流程照跑（六维度/五问人工执行）；账本缺席 → 治理动作一律拦截并问主人，**不得静默放行**（联邦原则：治理缺席收敛保守侧）。
