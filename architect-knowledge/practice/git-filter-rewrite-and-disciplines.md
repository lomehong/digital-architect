---
title: 重大卷稿事故与 git 历史改写（filter-branch 实战 + 推送纪律升级）
domain: dsh-ecosystem
source:
  origin: digital-architect 执行实证（2026-09-11，11d1494→30cd70f→cc09dad 链；filter-branch 2026-09-11）
  ref: docs/designs/2026-09-11-生产化阶段二-走查记录.md；commit 备份分支 backup/pre-rewrite-20260911 + bundle E:\code\nodejs\digital-architect-backup-pre-rewrite.bundle
confirmed: 2026-09-11
status: 待审核
owner: 主人
---

# 重大卷稿事故与 git 历史改写（filter-branch 实战 + 推送纪律升级）

## 事故经过（升级版）

接续 `multi-session-git-discipline.md`（0319b3c / 3b5f080，18 文件卷稿）——本会话在 v3.2 阶段把核心入总仓（commit `11d1494`，2026-09-11 15:28），用 `git add -A` 跨过大脑仓/子仓差异，把 `packages/architect-core/{node_modules/, lib/}` 一并卷入提交：

- `node_modules/`：**1063 个文件 / 约 78 万行**（vitest/esbuild/chai 等依赖与 .bin 启动器），本应由 `.gitignore`（已存在）排除；
- `lib/`：核心的 `tsc` 构建产物（lint/kbcollect/coverage/digest 的 .js + types/），本应仅发布时打包，不入版本库；
- 当笔 1080 files changed +783,936 行；D11 单元 11d1494 已 **push 到 origin**。

跟进 `30cd70f` 用 `git rm -r --cached` 清出跟踪并补 `.gitignore`——但**内容已存在于 .git 对象库**（分支引用断链后对象仍可达 / 需 gc 释放）。

## 推送纪律升级（重大卷稿的事前阻断）

`multi-session-git-discipline.md` 三条保留并升级为**推送前硬门禁**：

1. **提交前清单**：每个 commit 的 `git status --short` 产物必须**全部为本会话明列文件**；发现他方文件 → 不 commit，先停；
2. **禁 `git add -A`**：跨工作树 / 跨会话阶段一律按 `git add <path...>` 精确点名；临时构建产物（dist、lib、node_modules 等）必须 `.gitignore` 覆盖；
3. **强推（`git push --force`）属 L2+ 走账本审批**：本事件中清理残留属 owner 显式批准的例外；常态不允许会话自行 force-push；
4. **子模块/外部依赖的 `.gitignore` 由父仓 root 与子包 root 双层覆盖**——单层 `.gitignore` 不足以拦截 `git add -A` 跨子目录的渗透。

## 历史改写（filter-branch 实战）

owner 批准后执行清理（2026-09-11），记录供复用：

```bash
# 0. 备份
git branch backup/<日期>-pre-rewrite main
git bundle create <repo-parent>/<repo>-backup-pre-rewrite.bundle main

# 1. filter-branch（index-filter 仅删路径，不重写工作树；O(提交数) 快）
git filter-branch --index-filter \
  "git rm -r --cached --ignore-unmatch <pathA> [<pathB> ...]" HEAD

# 2. 清理不可达对象
git reflog expire --expire=now --all
git gc --prune=now

# 3. 验证内容等价（关键 — index-filter 不应改业务内容）
git diff --stat backup/<...>..HEAD          # 应为空或仅路径删除

# 4. 强推（L2+ 凭 owner 显式授权）
git push --force origin main
```

**实测数据**（digital-architect，67 提交重写）：
- 文件级 `git diff backup...main --stat` = **0**（业务内容完全保留）；
- 提交哈希：仅 6 个直接受污染的提交改哈希，其余 51 个（更早历史）字节相同 → filter-branch 仅在确有污染处改树；
- `.git` 物理大小：从含 78万行不可达 blob 缩至 **14.58 MB**（gc 后）；
- `git count-objects -v`：garbage=0，prune-packable=0 → 完全干净。

## 跨会话同步提示（force-push 后）

主仓 `main` 重写后，所有本地/其他克隆需对齐：

```bash
git fetch origin
git checkout main && git reset --hard origin/main    # 干净重置（无未提交改动）
# 或：git pull --rebase origin main                  # 保留本地未提交
```

子模块（`dsh-architect`、`omp-architect`）的 gitlink 在 filter-branch 中**不受影响**（不在 --index-filter 路径列表），所以指针值不变；只有父仓 commit 的 SHA 变。

## 教训（升级合订）

1. `.gitignore` 必须在父仓 root 与每个子包 root **同时**覆盖构建/依赖产物；
2. `git add -A` 在跨目录 / 跨阶段场景**绝不**使用——本事故两次踩同坑（0319b3c 卷 18 文件 + 11d1494 卷 78万行），证明它是单点风险；
3. 发现卷稿后**清理分两步**：先 `git rm --cached` 让后续 commit 不再引用（业务正确性恢复），再 `filter-branch + gc` 清理历史对象（卫生与仓库体积）；两者缺一不可；
4. 历史改写是高风险杠杆（force-push、跨会话同步），必须有备份（branch + bundle）与显式授权（L2+），不得常规化。
