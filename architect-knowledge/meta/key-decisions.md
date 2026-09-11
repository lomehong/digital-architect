---
title: 关键设计决策记录（已与主人对齐）
domain: dsh-ecosystem
source:
  origin: digital-architect/docs/HANDOFF.md
  ref: §4.3
confirmed: 2026-09-10
status: 已确认
owner: 主人
---

# 关键设计决策记录

| # | 决策 | 结论 | 理由 |
|---|---|---|---|
| D1 | 载体形态 | 阶段 1 用 **SKILL 文件 + 知识库目录**（零代码、纯知识工程）；验证有效后阶段 3 再插件化 | 符合文章 SKILL 化主张（团队经验封装为可执行任务包）；先验证流程价值再投入工具建设 |
| D2 | 首个验证场景 | **自举**：「基于数字分身套件现状，设计知识库体系的技术方案」 | 跑流程的同时完成套件自身的知识蒸馏，一举两得；知识源全在手边 |
| D3 | 知识库位置 | 本仓 `architect-knowledge/`（仓库 `github.com/lomehong/digital-architect`，git 管理） | 可协作、随身携带、与代码工程同等对待 |
| D4 | 与数字分身关系 | 架构师 SKILL **挂在数字分身上**——分身 = 执行 Harness，SKILL = 流程 | 不是第二只分身，是分身的新能力；复用既有 Harness（看板/账本/记忆/守卫）零改造 |
| D5 | 渐进式披露实现 | SKILL 里的**分步阅读路径指令**（按层 read 知识库文件） | 零代码即可落地四层装载 |
| D6 | 人工决策门实现 | ask_user（会话内）+ 账本审批（今日待办） | 与文章图 7 的六类决策门天然对应 |
| D7 | 审计实现 | 任务看板 runs + memory 来源标注 | 已内建，不重复建设 |
| D8 | Knowledge Evolution | 方案落定 → 拆看板任务 → 认领执行 → 自报 → 主人确认 → 经验沉淀回灌知识库 | 文章闭环（方案→任务→经验→知识库），套件机制已内建 |
| D9 | 宿主范围 | **宿主中立核心 + 适配边缘**：知识库/SKILL/模板不绑定宿主；宿主机制差异（提问/审批/任务/记忆/挂载/工具）收敛到 `adapters/<host>.md`（现有 dsh、oh-my-pi） | 架构师职能属于流程与知识，不属于某个宿主；新增宿主只写适配文件，不改 SKILL 与知识库（见 `../../adapters/README.md`，2026-09-10 主人指示支持 oh-my-pi） |
| D10 | 仓库域归属 | **digital-architect 与 digital-twin 是两个平级总仓**：dsh-architect 从 digital-twin 退出（宪章 v1.4 撤销 v1.2 行），以 submodule 归入本总仓；dsh-yuyi 以 **submodule 双总仓共享**（两仓各持独立指针）；架构师 Agent 经 **yuyi 与数字分身通讯** | 总仓边界 = 领域边界：架构师体系（知识/SKILL/插件/模板）不属分身套件；通信件（yuyi）是两个体系共享的协议底座（2026-09-10 主人拍板） |

## SKILL 挂载方式（按宿主，详见 `../../adapters/<host>.md`）

- **dsh**：技能发现根（dsh-skill-filesystem，深度为一层）：`<projectRoot>/.dsh/skills`（rank 100）、`$DSH_HOME/skills`（rank 400）等。挂载 = 把本仓库 `skills/<name>/` 以 junction/link 接入被扫描根目录；frontmatter 必填 `name`（kebab-case）+ `description`。
- **oh-my-pi**：`<skills-root>/<skill-name>/SKILL.md`（一层目录）——项目级 `.omp/skills/`（native）或 `.agents/skills/`（canonical），omp 亦默认读 `.claude/skills/`；frontmatter 同格式。检查工具经 dsh-architect 仓 `./omp` 导出（CustomToolFactory，同一组纯函数）。
