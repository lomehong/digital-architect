---
title: 外壳化迁移断链与 detached HEAD 推送教训（kbcollect 案例）
domain: dsh-ecosystem
source:
  origin: digital-architect 执行实证（2026-09-11 拉取后冒烟，dsh-architect e31df61→8e7aec8）
  ref: dsh-architect/scripts/lint-knowledge.mjs；父仓 ci.yml L30；docs/metrics/方案完备度基线.md 同期
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# 外壳化迁移断链与 detached HEAD 推送教训

## 事故一：符号迁核后 CLI 旧 import 断链

- 外壳化（11d1494）把 `kbcollect.ts` 迁入 `packages/architect-core`，但 `dsh-architect/scripts/lint-knowledge.mjs` 仍 `import '../lib/kbcollect.js'`——该路径自迁移起不再有构建产出，CLI `ERR_MODULE_NOT_FOUND`；
- **父仓 CI（ci.yml L30）跑的正是这条命令 → 知识库门禁在远程 HEAD 上静默失效**；此前未暴露是因为 CI 先卡在子模块凭据步骤（SUBMODULE_TOKEN 未配置）——与「机制失效期掩盖缺陷」（宪章自锁事故）同构；
- 发现方式：**拉取后的例行门禁冒烟**——本地跑 lint 即 ERR。

**教训**：
1. 迁移符号时必须 grep 旧路径的**全部**消费方——含 `scripts/`、CI、文档示例，不只 `src/`（3864ed7 抽取 kbcollect 时只顾了 src/）；
2. 外壳消费核心一律走**包名导入**（`from 'architect-core'`，core 根已 `export *`）——相对路径戳别的包的 lib 内部文件会在迁移时断、在外壳单独安装时也断；
3. 拉取/重组后必跑门禁冒烟（本次正是冒烟抓到）。

## 事故二：子模块 detached HEAD 上直接提交

- `git submodule update` 检出固定指针 → 子模块处于 detached HEAD；在其上提交后 `git push` 静默失败（无上游分支），而父仓指针 bump 已先行推送——远程出现**指向不存在对象的指针**；
- 修复：`push origin HEAD:main` + `update-ref refs/heads/main` + `checkout main`，三方（本地/远程/父仓指针）核实一致。

**教训**：
1. 子模块内提交前先确认在分支上（`status -sb` 无分支名 = detached）；不在游离头上提交；
2. 父仓指针 bump **必须晚于**子模块推送成功核实——顺序反了会给远程制造悬空指针；
3. 推送后用 `ls-remote` 核实远程 ref，不以本地命令退出码为准。

## 适用范围

两外壳仓（dsh-architect / omp-architect）与父仓的一切重构迁移、子模块操作；与 F1（git-filter-rewrite-and-disciplines）同属「迁移与打包纪律」族。
