---
title: AI 原生研发团队工程实践（腾讯 Vibe Flowing 蒸馏）
domain: methodology
source:
  origin: 腾讯技术工程公众号《从 Vibe Coding 到 AI 原生研发团队：一套能落地的工程实践》（masoncai，2026-07-21）
  ref: https://mp.weixin.qq.com/s/DrIpzHm777Zd8klcyAICBA（原文浏览器快照；全文经网易镜像交叉核对 https://m.163.com/dy/article/L2CS0M180518R7MO.html）
confirmed: 2026-09-11
status: 待审核
owner: 主人
---

# AI 原生研发团队工程实践（腾讯 Vibe Flowing 蒸馏）

## 主张：守质量下限，而非推能力上限

- 让 AI 连续跑一整天是 Harness Engineering 的**能力上限**，适合从零起步/低业务关联任务，token 成本高、日常少用；
- 日常开发（加功能/修 Bug）用**轻量 Vibe Coding**即可——本文重心是**守住质量下限 + 提高 token 效率**（与本项目「字节指标诚实结论」同调：不堆重机制，按需生长护栏）；
- ROI 最高的路径：**先让 AI Coding 运转起来，护栏随实际需求逐步生长**。

## 三层体系

| 层 | 内容 | 价值 |
|---|---|---|
| 基础设施 | 通用能力底座：日志/RBAC 权限/访问审计/开放 API Token/MCP 工具/定时任务/工作流（Durable Function）；内部 SDK 以 submodule 进仓让 Agent 自行探索 | AI 不从零搭基建，不在底层问题浪费 token |
| 工程护栏 | monorepo 分层（controllers→services→models→source 单向依赖）+ 每职能目录 `_framework/` 脚手架子目录；Rules 三层（AGENTS.md 工程规范 / 容器规则「研发流程约束+用户保护」/ 插件记忆系统）；Skills 技能包；TDD 取舍；轻量 SDD；CLI 封装运营操作；组件化+Storybook；让 AI 看见问题四层；DB 变更管控；Agent 即代码 | AI 行为有下限，人的审查负担最低 |
| 协作机制 | 页面圈点评论提需求（记录路径/xpath/截图）→ 状态流转 open/resolved/closed；统一研发容器 3 分钟全自动初始化；能力地图 | 非开发者参与面打开，提需求门槛最低 |

## 关键实践点

- **Rules 三层设计原则**：规则集中、分场景加载、不重复——规则散乱既费 token 又让 AI 混淆；
- **Rules 与 Skills 关系**：Rules 保底线（不犯错），Skills 提效率（干活快）——光有 Rules 每次摸索怎么干，光有 Skills 可能不合规范；
- **三阶段流程不可绕过**：需求讨论→开发实现→确认提交，阶段间须用户明确确认，禁止 AI 自判「小改动可跳过」（与本项目「自报 ≠ 完成」同构）；
- **轻量 SDD**：文件命名约定即工作流——`draft_`（讨论中）→ `ready_`（可开发）→ `done/`；AI 读完一个 ready 文档即拥有完整需求上下文，文档本身由 AI 协助整理、人 review 后放行；
- **TDD 取舍**：AI 易写「自欺欺人」的测试（只覆盖 happy path/断言太弱）；核心业务逻辑必须有后端单测，前端 E2E 覆盖关键流程，互补不替代；覆盖率 70% 为参考值不阻断；**更看重「验收」而非「测试」**（Playwright 截图 + 提需求人确认闭环）；
- **运营操作 CLI 化**：DDL/回数/配置不走 AI 临时脚本——唯一入口 CLI（高危关键字硬拦截 + 强制落 changelog 留痕 + dry-run + 按风险分级：加字段直接执行/改类型先讲方案/无主键批量先 COUNT 确认/DROP-DELETE-TRUNCATE 硬拦截）；
- **组件化让审查可行**：SFC ≤500 行、子组件 100~200 行、composable 30~70 行、每组件配 Storybook story（story=给 AI 的「组件说明书」，防止重复造轮子 + 开发后补 story 即自测）；
- **让 AI 看见问题四层**：静态检查即反馈 → AGENTS.md 规则集中 → AI 自管开发服务（启停/日志/进程）→ Playwright 截图自验；
- **代码去腐化双技能**：AI 原生研发代码腐化更快——两个职责分离的技能（扫描建 issue / 认领修复），避免「既当裁判又当运动员」，Agent 高频小批量定期运行；
- **Agent 即代码（Everything as Code）**：提示词是文件、工具是函数、注册是装饰器——所有产物在代码仓里，可追踪可 review 可回滚；「代码即配置」取代「平台+后台配置」，AI 在充满能力的生态里搭积木而非白纸作画；工具返回值用 **markdown 而非原始 JSON**（Agent 易读 + token 大减 + 人看得懂）。

## 本仓落点（适用范围）

- **互证**：SKILL 化=Skills、守卫文本+知识库+SKILL=Rules 三层的等价物、看板验收语义=「验收>测试」、architect_* 工具 markdown 输出=「工具返回 markdown」、渐进披露=「规则集中不重复」；
- **可借鉴**：①代码去腐化双技能蓝图（为分身线建扫描/修复分离的技能对，接看板闭环）；②能力地图（见 `token-efficiency-and-human-feedback.md`）；③运营操作 CLI 化模式（分身线未来涉 DB/运营操作时的护栏设计范本）；
- **不适用**：其技术栈（Python/Vue/FastMCP/DBOS/APScheduler）与「全员开发平台」主张——本项目是治理/架构职能，非研发平台。
