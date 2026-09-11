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

## 任务执行（任务面契约的 dsh 实现）

**契约**：`architect-knowledge/principle/task-and-memory-surface.md`（五操作 create/claim/report/confirm/list + 四态状态机 + 四不变量）。SKILL 只写操作名，本文给出 dsh 侧映射：

| 契约操作 | dsh 实现 |
|---|---|
| `create` | `task_delegate` 立项（任务描述含可验收条目，附方案路径） |
| `claim` | `task_claim`（会话压缩后 session 变化由看板接管语义处理） |
| `report` | `task_report` |
| `confirm` | 今日待办确认/驳回（**只有主人可发起**） |
| `list` | 看板面板 / activity 查询 |

- **验收语义**：自报 ≠ 完成——进「待确认」，主人在今日待办确认/驳回后才落定终态；
- **治理**：push/发布/删除等走账本 L2+ 审批（令牌 + 授权窗口），未获授权即停。

## 记忆沉淀（记忆面契约的 dsh 实现）

**契约**：同 `principle/task-and-memory-surface.md` §二（write/read/supersede/verify + 来源必填 + 替代不删除）。dsh 映射：

- 已验证结果（主人确认后）沉淀 dsh-memory（`POST /dsh-memory/entries`，`x-memory-token`；替代语义更新不覆盖历史）；
- 结构化知识以本仓库 git 条目为权威（`architect-knowledge/`，条目格式见知识库 README）；
- 人格/任务/记忆语义查 dsh-memory 与宪章，工程架构事实查本知识库（边界见 meta 概念模型）。

## 代码执行面（architect-implement 落地面，2026-09-11）

| 面 | dsh 落地 |
|---|---|
| 编码执行方 | 主人点名：架构师自编（本会话直接在目标项目编码）或委派分身（`task_delegate` + 可选御驿协同）；不自作主张 |
| 分支纪律 | 目标项目内建 `feature/<任务号>-<slug>`；看板任务号即分支前缀（可追溯）；主工作树保持基线 |
| 提交 | 小步中文 commit，注明改动归属（方案条目号）；commit 允许，**push/发布属 L2+ 走账本审批** |
| 测试证据 | 执行会话自跑测试并把真实输出写进 `task_report`；实现评审由**非编码会话**执行（评审者复跑抽查） |
| 验收 | 自报 ≠ 完成：实现评审通过 + 主人在今日待办确认 → 才可合并/交付；合并后经验回灌 practice/ |
| 降级面 | 账本缺席 → 编码可继续（本地 commit），**push/发布一律停并问主人** |

## 挂载与工具

- **SKILL 挂载**：技能发现根（dsh-skill-filesystem，深度一层）：`<projectRoot>/.dsh/skills`（rank 100）、`$DSH_HOME/skills`（rank 400）等；挂载 = 把本仓库 `skills/<name>/` 以 junction/link 接入被扫描根目录；frontmatter 必填 `name`（kebab-case）+ `description`。
- **检查工具**：dsh-architect 插件（`@dsh-extra/dsh-architect`）：主插件行注册 `dsh-architect` 服务；模型工具行 `@dsh-extra/dsh-architect/tools` 在 agent 预设插件列表追加（条件装配——装了才有行）。工具：`architect_digest` / `architect_design` / `architect_review`。
- **降级面**：检查工具缺席 → SKILL 流程照跑（六维度/五问人工执行）；账本缺席 → 治理动作一律拦截并问主人，**不得静默放行**（联邦原则：治理缺席收敛保守侧）。
