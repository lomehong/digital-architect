---
title: 宿主适配：oh-my-pi（omp）
domain: dsh-ecosystem
source:
  origin: oh-my-pi 官方文档 docs/skills.md + docs/custom-tools.md（github.com/can1357/oh-my-pi @ main，2026-09-10 实读）
  ref: 技能发现（native/.agents/.claude 提供方，一层目录）+ CustomToolFactory 契约；dsh-architect 仓 ./omp 导出
confirmed: 2026-09-10
status: 待审核
owner: 主人
---

# 宿主适配：oh-my-pi（omp）

> omp 是 pi-mono 的分支、终端编码 Agent（Bun + Rust，原生支持 Windows）。
> 本文是 SKILL 在 omp 宿主上的五面映射。**核对路径**：机制细节以 omp 官方文档与源码为准
> （omp 迭代快，升级后按 `docs/skills.md` / `docs/custom-tools.md` 复核本文）。

## 判别特征（任一命中即 omp 宿主）

会话工具面出现以下任一项：`ask`（结构化提问）、`task`（子代理 fan-out）、`todo`、
`retain` / `recall` / `learn`（memory.backend 启用时）、`skill://` 读协议。
环境特征：`.omp/` 目录（项目或 `~/.omp/agent`）、`omp` CLI。

## 决策门映射

| 门 | omp 落地 |
|---|---|
| Unknown（未知） | `ask` 工具（结构化选项提问，带倾向建议与理由） |
| Conflict（知识/事实冲突） | `ask` + 按事实类型回对应来源核对（代码/已确认知识/实践记录） |
| Business Trade-off（业务取舍） | `ask`，主人拍板 |
| Cross-team Commitment（跨团队/跨会话承诺） | `task` 子代理（单机并行，可隔离 worktree）；**跨设备协同无对应物**——如实声明能力边界，改由主人中转，不得假装已协同 |
| Compliance（合规） | **无账本对应物**——降级 = 强制 `ask` 主人确认 + 依赖宿主 approval-mode 权限门；**不得静默放行**（降级收敛保守侧） |
| High-risk Change（高风险变更） | 同上：一律停止问主人；omp 的破坏性工具权限确认是底线而非替代 |

## 任务执行

- 方案落定后：`todo` 建会话内有序任务清单（含 phase 跟踪）；独立并行的工作用 `task` 子代理（schema 化结果回读）；
- **验收语义不变**：omp 无跨会话看板与确认按钮——产出自报后必须经 `ask` 向主人请求验收，
  **主人确认才落定**；子代理产出等同自报，不因 fan-out 而免验收。

## 记忆沉淀

- **结构化知识以本仓库 git 提交为准**：经验/教训回灌 `architect-knowledge/practice/`（条目格式见知识库 README）；
- 检索面可选双写：`retain` 一条指针（含知识条目路径）进 memory bank，`recall` 供跨会话召回；
- 可复用的操作型经验可用 `learn`（可提升为 managed skill）；managed 技能优先级最低
  （omp 同名技能先命中 authored 技能），**不会覆盖本知识库的权威性**。

## 挂载与工具

- **SKILL 挂载**：把本仓库 `skills/<name>/` 放入或 junction 到 omp 技能发现根的一级子目录——
  项目级 `.omp/skills/`（native，priority 100）或 `.agents/skills/`（canonical）；omp 亦默认读
  `.claude/skills/`（priority 80）。布局 `<skills-root>/<skill-name>/SKILL.md`（一层，不嵌套）；
  frontmatter `name` + `description` 必填（本仓三个 SKILL 均满足；`whenToUse` 作为未知元数据保留）。
- **知识库路径**：`skill://<name>` 只解析技能目录内部（拒绝 `..` 穿越）；`architect-knowledge/`
  在技能目录之外，SKILL 中的相对路径以**仓库根**为基准用普通 `read` 读取——omp 会话 cwd 须在本仓库根（或在项目 AGENTS.md 声明仓库根路径）。
- **检查工具**：dsh-architect 仓 `./omp` 导出（`src/omp.ts`，CustomToolFactory ×3）——与 dsh 工具
  同名同语义（`architect_digest` / `architect_design` / `architect_review`），复用同一组纯函数。
  安装：把构建产物 `lib/omp.js`（或 `src/omp.ts`，Bun 直接加载 TS）路径配置进 omp 工具发现
  （`~/.omp/agent/tools`、项目 `.omp/tools`，或 settings 的工具配置路径）。
- **降级面**：检查工具缺席 → SKILL 流程照跑（六维度/五问人工执行）；无账本 → 治理类动作
  一律 `ask` 主人，**不得静默放行**。

## 与 dsh 适配的差异速查

| 面 | dsh | oh-my-pi |
|---|---|---|
| 会话内提问 | `ask_user` | `ask` |
| 治理审批 | 账本 L0-L3（今日待办） | 无对应物 → 强制 `ask` + approval-mode |
| 任务面 | 看板（task_delegate/claim/report，跨会话权威） | `todo` + `task` 子代理（会话内） |
| 记忆 | dsh-memory（HTTP，替代语义） | memory bank（retain/recall）+ 本仓库 git 为权威 |
| 技能挂载 | `$DSH_HOME/skills` / `.dsh/skills` | `.omp/skills` / `.agents/skills` / `.claude/skills` |
| 检查工具 | dsh-architect 插件（cordis tools.register） | dsh-architect 仓 `./omp` 导出（CustomToolFactory） |

## 容器化接入（已落地，2026-09-10）

docker/ 目录提供官方 omp 宿主的容器形态，**本总仓整仓挂载为工作区**（`/workspace`）：

- 镜像：node24 + Bun（npm 分发）+ 官方 `@oh-my-pi/pi-coding-agent`（omp 18.x，预编译 natives）；
- 工作区：整仓挂载——知识库/SKILL/模板/适配层相对路径全通，`dsh-architect` submodule 随仓在内；
- 工具发现：仓库根 `.omp/tools/architect/index.ts` 转发模块 → submodule `src/omp.ts`（omp 扫描 cwd 的 `.omp/tools/<name>/index.ts`，实测已加载）；
- 技能：仓库根 `.omp/skills/`（native）与 `.claude/skills/`（继承）双根副本，**源在 `skills/`，改技能后需同步副本**；
- LLM：`.env`（DEEPSEEK_API_KEY，gitignore）→ `deepseek/deepseek-flash` 预配为 default 角色（`docker/omp/agent/config.yml`）；
- 用法：`docker exec -it oh-my-pi omp`（TUI）/ `docker compose run --rm omp -p "需求"`；
- 实测：模型在真实会话调用 `architect_digest` 返回完整六项覆盖表（工具链路已验证）。
