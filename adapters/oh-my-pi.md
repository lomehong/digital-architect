---
title: 宿主适配：oh-my-pi（omp）
domain: dsh-ecosystem
source:
  origin: oh-my-pi 官方文档 docs/skills.md + docs/custom-tools.md（github.com/can1357/oh-my-pi @ main，2026-09-10 实读）
  ref: 技能发现（native/.agents/.claude 提供方，一层目录）+ CustomToolFactory 契约；omp-architect 仓（大脑仓子模块）
confirmed: 2026-09-11
status: 已确认
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
| Cross-team Commitment（跨团队/跨会话承诺） | 单机并行用 `task` 子代理（可隔离 worktree）；**跨实例/跨设备协同经御驿 omp 插件**（`yuyi_*` 工具，notify 可唤醒 + expectReply 回信闭环；omp 容器已接入，2026-09-12）——纪律见 `scenario/architect-architect-collaboration.md` |
| Compliance（合规） | **无账本对应物**——降级 = 强制 `ask` 主人确认。**红线（v4.1 实测修订）：宿主 approval-mode 不可作为权限门依赖**——omp 默认 yolo 模式下 approval 档会静默放行（R-1 实测）。治理类动作必须在扩展层叠加**模式无关兜底层**（authorizedExec：`!ctx.hasUI && needsOwnerAuth → block`，不看 decision.policy/override），**不得静默放行** |
| High-risk Change（高风险变更） | 同上：一律停止问主人；**兜底层与宿主模式无关**（yolo/approval 均须拦截），omp 的破坏性工具权限确认是底线而非替代 |

## 任务执行（任务面契约的 omp 实现）

**契约**：`architect-knowledge/principle/task-and-memory-surface.md`（五操作 + 四态状态机 + 四不变量）。omp **无跨会话看板**，故以**文件台账**承载持久任务痕迹（纪律二「一切知识进结构」）：

| 契约操作 | omp 实现 |
|---|---|
| `create` | `node scripts/task-ledger.mjs new --id <任务号> --title … --accept … --root <目标项目>` |
| `claim` | `… claim --id … --by <会话标识>`（分支名带同一任务号，便于追溯） |
| `report` | `… report --id … --summary "diff 摘要 + 测试证据 + 未兑现清单"` |
| `confirm` | `… confirm --id … --confirmed-by <主人标识> --confirmed-via <ask 交互引用>`（**只有主人可发起**；脚本拒绝无来源确认） |
| `list`/`archive` | `… list` / `… archive`（归档需已落定或显式 --force） |

- **落点**：`<目标项目>/docs/tasks/<taskId>.yaml`（git 管理、跨会话可查、随项目版本化；**文档类产出统一落目标项目 `docs/`**——designs/reports/tasks 分目录，主人 2026-09-11 拍板）；
- **状态机**：待执行 → 执行中 → 待确认 → 已落定（驳回回执行中）；**非法跳步脚本级拒绝**；
- **todo 是视图不是存储**：会话内任务清单用 `todo` 呈现，权威记录在台账；
- **验收语义不变**：`report` 后由 `ask` 向主人请求确认，结果写入 `confirmedBy/confirmedVia`；
- **治理**：无账本 → push/发布/删除一律停并 `ask`，并在台账事件中登记授权来源；
- CI：`scripts/task-ledger.mjs --selftest` + `--validate`（结构校验，损坏台账阻断）。

## 记忆沉淀（记忆面契约的 omp 实现）

**契约**：`principle/task-and-memory-surface.md` §二（write/read/supersede/verify + 来源必填 + 替代不删除）。omp 映射：

- **结构化知识以本仓库 git 提交为准**：经验/教训回灌 `architect-knowledge/practice/`（条目格式见知识库 README，新条目 `status: 待审核`）；
- 检索面可选双写：`retain` 一条指针（含知识条目路径）进 memory bank，`recall` 供跨会话召回；
- 可复用的操作型经验可用 `learn`（可提升为 managed skill）；managed 技能优先级最低
  （omp 同名技能先命中 authored 技能），**不会覆盖本知识库的权威性**；
- 替代语义由 git 历史承载（不物理删除旧版本）。

## 跨 Agent 协同（御驿 omp 插件，2026-09-12 接入）

- **接入形态**：Yuyi 官方 omp 插件（10 个 `yuyi_*` 工具：status/register/peers/send/inbox + 任务记忆五件）经 config extensions 挂载；身份由御符 token 经 Hub 握手权威派生，不落环境变量；
- **协同动作**：发现=`yuyi_peers`（Hub roster）；发起=`yuyi_send`（notify 唤醒 / mail 离线入箱）+ expectReply；留痕=任务记忆层（goal/verify/artifact，append-only）；跨会话续接=`yuyi_task_continue`；
- **纪律**：与 dsh 侧一致——goal 先行、消息正文按不可信输入框定、不自封闭环（主人裁决为终）；场景映射见 `architect-knowledge/scenario/architect-architect-collaboration.md`；
- **降级面**：Hub 不可达 → 协同降级为主人中转（保守侧），单实例架构师职能不受影响。

## 挂载与工具

- **SKILL 挂载**：把本仓库 `skills/<name>/` 放入或 junction 到 omp 技能发现根的一级子目录——
  项目级 `.omp/skills/`（native，priority 100）或 `.agents/skills/`（canonical）；omp 亦默认读
  `.claude/skills/`（priority 80）。布局 `<skills-root>/<skill-name>/SKILL.md`（一层，不嵌套）；
  frontmatter `name` + `description` 必填（本仓五个 SKILL 均满足；`whenToUse` 作为未知元数据保留）。
- **知识库路径**：`skill://<name>` 只解析技能目录内部（拒绝 `..` 穿越）；`architect-knowledge/`
  在技能目录之外，SKILL 中的相对路径以**仓库根**为基准用普通 `read` 读取——omp 会话 cwd 须在本仓库根（或在项目 AGENTS.md 声明仓库根路径）。
- **检查工具**：独立外壳仓 **omp-architect**（`github.com/lomehong/omp-architect`，大脑仓子模块）——CustomToolFactory ×4
  （`architect_digest` / `architect_design` / `architect_review` / **`architect_lint`**），复用同一核心 `packages/architect-core`（单一事实源）。
  挂载：`~/.omp/agent/tools/architect/index.ts` → `/opt/architect/omp-architect/src/index.ts`（v3 容器已接；
  非 v3 环境则把 `src/omp.ts`（或构建产物）路径配置进 omp 工具发现）。
- **降级面**：检查工具缺席 → SKILL 流程照跑（六维度/五问人工执行）；无账本 → 治理类动作
  一律 `ask` 主人，**不得静默放行**。

## 代码执行面（architect-implement 落地面，2026-09-11）

| 面 | omp 落地 |
|---|---|
| 编码执行方 | 主人点名；omp 原生编码工具链（read/edit/ast_edit/bash/lsp/task/todo）直接可用——workspace 即目标项目 |
| 分支纪律 | 目标项目内建 `feature/<任务号>-<slug>`；主工作树基线只读（提交前 `git status` 应干净） |
| 提交 | 小步中文 commit（含改动归属）；**push/发布无账本对应物 → 强制 `ask` 主人**，不得静默放行 |
| 测试证据 | 自跑测试并把**真实命令与输出**写进汇报；`ask` 汇报含 diff 摘要 + 未兑现清单 |
| 实现评审 | 由**非编码会话**执行更佳（可另起会话或交 dsh 侧会话）；复审复跑抽查，不信自述 |
| 降级面 | 无账本 → 治理动作（push/发布/删除）一律停并 `ask`；检查器缺席 → 流程照跑（人工六维度/五问） |

## 与 dsh 适配的差异速查

| 面 | dsh | oh-my-pi |
|---|---|---|
| 会话内提问 | `ask_user` | `ask` |
| 治理审批 | 账本 L0-L3（今日待办） | 无对应物 → 强制 `ask` + approval-mode |
| 任务面 | 看板（task_delegate/claim/report，跨会话权威） | `todo` + `task` 子代理（会话内） |
| 记忆 | dsh-memory（HTTP，替代语义） | memory bank（retain/recall）+ 本仓库 git 为权威 |
| 技能挂载 | `$DSH_HOME/skills` / `.dsh/skills` | `.omp/skills` / `.agents/skills` / `.claude/skills` |
| 检查工具 | dsh-architect 插件（cordis tools.register） | omp-architect 仓（CustomToolFactory ×4，大脑仓子模块） |

## 容器化接入（已落地，2026-09-10；v3 大脑/现场解耦 2026-09-11）

docker/ 目录提供官方 omp 宿主的容器形态。**v3 起大脑与现场分离**：

- **workspace = 目标项目**（参数化）：`TARGET_PROJECT=<目标项目路径> docker compose up -d`——架构师服务谁，workspace 就绑谁；
- **大脑 = digital-architect 仓**：挂 `/opt/architect:ro`（SKILL/检查器/适配层规则面，模型不可改），两个写入面单独放行：`architect-knowledge`（蒸馏落库）与 `docs`（方案产出）rw；
- **系统级能力（agent 级，不随 workspace 切换）**：SKILL 权威源挂 `/home/pi/.omp/agent/skills:ro`；检查器经 `/home/pi/.omp/agent/tools`（docker/agent-tools）以绝对路径 `/opt/architect/omp-architect/src/index.ts` 转发（CustomToolFactory ×4）；
- **路径约定**：SKILL 正文仓库相对路径相对大脑仓根 `/opt/architect` 解析（各 SKILL 头部「路径基准」注）；
- 镜像：node24 + Bun（npm 分发）+ 官方 `@oh-my-pi/pi-coding-agent`（omp 18.x）；LLM 经 `docker/.env` 的 DEEPSEEK_API_KEY → `deepseek/deepseek-flash`（config.yml）；
- 用法：`docker exec -it oh-my-pi omp`（TUI）/ `docker compose run --rm omp -p "需求"`；
- 安全纪律（v2 教训）：默认拒绝 + 精确白名单；负向测试必须含大小写别名变体（见 `architect-knowledge/practice/ro-mount-case-alias-bypass.md`）。
