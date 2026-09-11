---
title: 换行符纪律与 .env 操作事故——架构师编码首试点的两条教训
domain: methodology
source:
  origin: 架构师编码能力首试点实录（TB-1789102220672-cuxhc，2026-09-11，主人已知悉）
  ref: docs/designs/2026-09-11-架构师编码能力首试点-走查记录.md；commit b20b4de
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# 换行符纪律与 .env 操作事故——架构师编码首试点的两条教训

## 教训一：Windows 检出会把 shell 脚本变 CRLF，shebang 直接失效

**现象**：`docker/entrypoint.sh` 经 git 检出为 CRLF 后，容器报
`exec /usr/local/bin/omp-entrypoint.sh: no such file or directory` 并陷入启动循环——错误信息完全没提换行符，极具误导性（易被误判为挂载路径不存在）。

**根因**：脚本首行 `#!/bin/bash` 变成 `#!/bin/bash\r`，内核按字面查找解释器失败。

**处置**：新增仓库级 `.gitattributes`（`*.sh`/`*.bash`/`*.yml`/`*.yaml`/`*.json`/`*.md`/`*.ts`/`*.mjs` → `text eol=lf`）。这是**根因修复**，此前一次「临时转 LF」只治标——任何一次 checkout 都会复发。

**纪律**：脚本类资产跨 Windows/Linux 时，换行符必须由仓库声明（.gitattributes）而非人工维护；排查「文件存在却报 no such file or directory」优先怀疑 shebang/CRLF。

## 教训二：.env 是易失配置，测试替换必须先备份

**现象**：本会话内三次因操作 `.env` 丢失真实密钥（`Set-Content` 整体覆盖、`-replace` 后未还原、临时变量未持久化）。每次都需主人重填。

**根因**：`.env` 被当作普通文件随意重写，且其值无法从别处恢复（gitignore + 密钥不可再生）。

**对策（纪律）**：
1. 修改 `.env` 前**先备份**（`Copy-Item .env .env.bak`），改动完成后从备份还原；
2. 能用 env 覆盖（`docker compose run -e KEY=...`）或 `.env.test` 独立文件时，**不要动 `.env` 本体**；
3. 需要临时改键做红态测试时，把「改—测—还原」写成一个脚本一次跑完，避免跨命令丢失上下文；
4. 密钥类值一律不回显、不入日志、不入知识库。

**机制侧呼应**：entrypoint 的 fail-fast（见同日试点）恰好把「密钥丢失」从「静默 401」提前为「启动即拒」，是这类事故的机制化兜底——但纪律仍是第一道防线。
