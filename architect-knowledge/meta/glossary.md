---
title: 架构师体系统一语言（术语表）
domain: methodology
source:
  origin: 2026-10-10 编排流程吸收整合——writing-for-agents GLOSSARY 模式吸收（mattpocock/skills pin 49dd158d）
  ref: docs/designs/2026-10-10-编排流程吸收整合-技术方案.md
confirmed: 2026-10-10
status: 待审核
owner: 主人
---

# 架构师体系统一语言（术语表）

> **只做索引**：术语 + 一句话索引 + 权威定义指针。指针目标漂移以指针为准；新术语经需求拷问（digest 第二步）或 retro 即时登记。

| 术语 | 一句话索引 | 权威定义 |
|---|---|---|
| 架构师流程 | digest→design→review→implement→回灌 五阶段 | `skills/architect-*/SKILL.md` |
| 需求包 | 需求准入产出物（六项覆盖检查表+准入结论） | `skills/architect-prd-digest/SKILL.md` |
| 技术方案 | 六维度可执行设计（Do/Don't/系统覆盖/证据/风险/验证） | `skills/architect-design/SKILL.md` |
| 评审五问 | 改哪里/为什么改/影响谁/如何验证/还有什么没确认 | `skills/architect-review/SKILL.md` |
| 六维度覆盖评分 | 需求/系统/证据/风险/验证/不确定性各 0-10 分 | `skills/architect-review/SKILL.md` |
| 证据回源 | 关键结论必须回源真实代码/输出，不信自述 | `practice/evidence-strength-vs-conclusion.md` |
| 红灯不提交 | 验证清单先行，红灯状态不得进入提交 | `skills/impl-discipline/SKILL.md` |
| 自报≠完成 | report 只送入待确认，主人 confirm 才落定 | `principle/task-and-memory-surface.md` |
| 治理动作 | push/发布/删除数据/对外承诺——未授权即停 | `principle/task-and-memory-surface.md` |
| 决策门 | Unknown/Conflict/取舍/合规/高风险 → 停并问主人 | `skills/architect-prd-digest/SKILL.md` 第五步 |
| 待审核 | 知识条目入库前置状态，主人确认转已确认 | `architect-knowledge/review-queue.yaml` |
| 回灌 | 会话经验沉淀回知识库的闭环 | `principle/production-writeback-pipeline.md` |
| 拷问（grilling） | 对齐后才准出的结构化问询，3 轮上限 | `skills/architect-prd-digest/SKILL.md` 第二步 |
| 统一语言 | 项目术语共享词表，降啰嗦省 token | 本文件 + `principle/writing-for-agents.md` |
| 曳光弹切片 | 切穿所有层、可独立验收的垂直薄片 | `skills/architect-design/SKILL.md` 五规则 |
| expand–contract | 宽改三段式：扩展→分批迁移→收缩 | `skills/architect-design/SKILL.md` 五规则 |
| 阻断边 | 票间依赖显式声明（看板 `blocked_by`） | `skills/architect-design/SKILL.md` 五规则 |
| 就绪边界 | 所有 blocker 已落定的票集合，可并发执行 | `skills/ticket-split/SKILL.md` |
| 单向门/双向门 | 可逆性分级：回滚成本高 / 可常规回滚 | `principle/task-and-memory-surface.md` report |
| 爆炸半径 | 变更失误时受影响的面 | `principle/task-and-memory-surface.md` report |
| 发现根 | 宿主扫描技能的目录（.claude/.omp/.dsh/容器直挂） | `docs/designs/2026-10-10-技能发现根链接化收敛-技术方案.md` |
| 兼容链接 | 指回权威源 skills/ 的机器本地链接 | `scripts/link-skills.ps1|.sh` |
| 流程 D | 研发执行编排链路：grilling→spec-align→ticket-split→impl-discipline→dual-axis-review→retro | `principle/dev-orchestration-pipeline.md` |
| 流程 K | 架构师决策产出流程：digest→design→review→implement→回灌 | `skills/architect-*/SKILL.md` |
| 规格对齐 | 对话收敛成可拆票规格（用户故事级）+GLOSSARY/ADR 内联维护 | `skills/spec-align/SKILL.md` |
| 接缝（seam） | 测试只打的公共边界点；先约定接缝清单后写测试 | `skills/impl-discipline/SKILL.md` |
| 双轴评审 | 标准轴+规格轴并行子代理评审，分轴呈现永不 rerank | `skills/dual-axis-review/SKILL.md` |
| 诊断闭环 | 硬 bug 六阶段：反馈环→复现最小化→假设排序→单变量探针→修复回归→清理 | `skills/impl-discipline/SKILL.md` |
