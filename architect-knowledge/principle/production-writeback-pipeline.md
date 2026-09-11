---
title: 生产态写回管线（开发/生产状态分离下的知识回流）
domain: methodology
source:
  origin: 主人 2026-09-11 拍板「开发状态/生产运行状态分离」+ 三项决议（候选区路径/git-harvest 首版/知识快照全量五类）
  ref: principle/host-neutral-core.md 执行细则 6；principle/task-and-memory-surface.md；docs/designs/2026-09-11-omp插件化-走查记录.md
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# 生产态写回管线（开发/生产状态分离下的知识回流）

## 一、两种状态（不可混淆）

| | 开发态（大脑仓所在机器） | 生产态（任意机器，服务目标项目） |
|---|---|---|
| 大脑仓 | 存在（权威知识库，可读写+提交） | **不存在** |
| omp-architect | 子模块 + 源码 link（开发调试工装） | **已安装插件**（omp plugin install，自带只读知识快照） |
| 知识库 | 权威（待审核→确认→升级） | 插件只读快照 + **目标项目候选区**（唯一可写知识位置） |
| 工作产出 | 大脑仓 docs/designs（仅自举场景） | **目标项目 docs/**（designs/reports/tasks） |

**原则**：生产会话的一切持久化都落在目标项目内（留痕、可审计、不依赖大脑存在）；知识回流大脑是**收割动作**，由开发态执行。

## 二、生产态：候选区（唯一知识写入位置）

```
<目标项目>/.architect/knowledge/candidates/<date>-<slug>.md
```

- frontmatter 与知识库条目同格式，**新增 `kb_target` 字段**：`practice`（默认）/ `reference`——决定收割落点；
- `status: 候选-生产`（区别于大脑库的「待审核」——尚未进入大脑审核流）；
- 随目标项目 git commit（留痕）；收割后移入 `candidates/harvested/` 并加 `harvested:` 日期字段（防重复）。

**禁写区**：生产会话不得写 `principle/`、`meta/`、`scenario/`（规则面，开发会话专属）；不得写插件目录（只读快照）。

## 三、开发态：收割（kb-harvest）

`scripts/kb-harvest.mjs --from <目标项目根> [--kb <大脑知识库根>] [--dry-run]`：

1. 扫描候选区 → 逐条跑 knowledge-lint 同源校验（R1~R9；坏条目**拒绝收割**并留报告）；
2. 合格条目按 `kb_target` 复制进大脑 `practice/` 或 `reference/`，`status` 改 `待审核`（进入大脑审核流）；
3. 候选文件移入 `harvested/` 并记 `harvested` 日期；
4. 汇总报告（收割/拒绝/跳过计数）。

**并发裁决**：多架构师并发写回**不做自动合并**——同主题分歧走「回源核对 → 评审委员会纪律 → 主人拍板」（与任务面契约/协同场景条目的裁决纪律同构，D12：基建归御驿、裁决归纪律）。

## 四、插件知识快照（Q-C：全量五类）

omp-architect 打包时从大脑知识库构建**只读快照**（五类目录全量），随插件分发——生产架构师据此装载知识做判断。快照是**发布时点的切片**，更新 = 发新版本插件。

## 五、版本与升级

- `architect-core` → npm 发布（发布动作由主人执行，凭据不进任何会话）；
- `omp-architect` → 插件包（`omp plugin install` 从 marketplace/git/本地路径）；
- 升级路径：大脑知识库更新 → 重打插件包 → 生产端 `omp plugin upgrade`。
