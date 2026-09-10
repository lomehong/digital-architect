---
title: 场景映射：从需求到可执行技术方案的完整流水线
domain: methodology
source:
  origin: dsh-memory 条目 mem_1788978083156_yycfzp（千问AI平台《架构师 Agent 系统化落地》）
  ref: 图 7 架构推理 Runtime 全流水线 + HANDOFF §3.2/§4.2
confirmed: 2026-09-09
status: 已确认
owner: 主人
---

# 场景映射：从需求到可执行技术方案的完整流水线

**场景**：收到一份需求（PRD 或主人口头描述），产出可执行技术方案。
**技术映射**：以下十个阶段，由三个 SKILL 分段承载；每个阶段有明确的输入/产出/停止条件。

## 流水线十阶段

| # | 阶段 | 做什么 | 产出 | 承载 |
|---|---|---|---|---|
| 1 | 需求准入 | Scope/Acceptance/Unknowns；六项覆盖检查 | 结构化需求包（可验收目标/范围/不做项/假设/阻断项/待确认/专项评审触发） | prd-digest |
| 2 | 业务语义理解 | 按业务层知识对齐元语/场景（Meta/Scenario） | 业务术语表 + 场景命中 | design（第一层装载） |
| 3 | 架构链路分析 | Service Graph/Call Chain/Impact Analysis | 影响面清单 | design（第二层装载） |
| 4 | 服务知识加载 | AGENTS.md/.knowledge/Constraints/Validation | 系统约束清单 | design（第三层装载） |
| 5 | 代码与配置核查 | Git/Source Code/Config——**当前行为以代码为准** | 核对记录 | design |
| 6 | Gap Analysis | Reuse / Extend / Build | 复用/扩展/新建决策 | design |
| 7 | 技术方案起草 | Change Scope/Impact/Compatibility/Exception/Test/Release | 六维度方案初稿 | design |
| 8 | 证据与覆盖检查 | Requirement/System/Risk/Validation Coverage | 覆盖检查表 | design 自检 + review |
| 9 | 人工决策门 | 见下表六类门 | 决策记录 | ask_user / 账本审批 |
| 10 | 可执行技术方案定稿 | 五问通过 → 方案落定 | templates/executable-design.md 实例 | review 通过后 |

## 人工决策门六类（阶段 9，任何一类命中即停）

落点按**宿主适配层**（`adapters/<host>.md`）执行；下表为各门在现有宿主的主映射。

| 门 | dsh 落地 | oh-my-pi 落地 |
|---|---|---|
| Unknown（未知） | `ask_user` 会话内提问 | `ask` 工具结构化提问 |
| Conflict（知识/事实冲突） | `ask_user` + 按事实类型回对应来源核对 | `ask` + 同一核对纪律 |
| Business Trade-off（业务取舍） | `ask_user`，主人拍板 | `ask`，主人拍板 |
| Cross-team Commitment（跨团队/跨会话承诺） | 看板派发 + 御驿协同 | `task` 子代理（跨设备无对应物，如实声明） |
| Compliance（合规） | 账本 L2+ 审批（今日待办批准） | 无对应物 → 强制 `ask` 主人 + approval-mode，不得静默放行 |
| High-risk Change（高风险变更） | 账本 L2/L3 拦截，强制人工审批 | 同左（保守侧降级） |

## 停止条件与回写

- 任一阶段证据不足 → 显式登记「未知/待验证」，**不得编造补全**。
- 方案落定 → 按宿主适配文件拆任务（dsh=看板 `task_delegate` 立项 / oh-my-pi=`todo`+`task` 子代理）→ 认领执行 → 自报 → **主人确认**（语义两宿主一致）→ 「已验证结果」沉淀宿主记忆面（dsh=dsh-memory / oh-my-pi=memory 指针，仓库 git 均为权威）+ 经验回灌本知识库（Knowledge Evolution，决策 D8）。
- 评审驳回 → 带五问/覆盖缺口意见返回阶段 7。
