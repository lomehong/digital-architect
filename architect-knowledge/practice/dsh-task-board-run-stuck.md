---
title: dsh-task-board run.status 状态机缺推进路径（套件侧 bug 观察 + 运维清理工具）
domain: dsh-ecosystem
source:
  origin: 主人 2026-09-11 实测发现（重启 dsh-desktop 后看板仍显示 18 项「待审批」run；ledger 服务 /dsh-ledger/approvals = [] 实测确认无令牌）
  ref: github.com/lomehong/dsh-task-board
confirmed: 2026-09-11
status: 待审核
owner: 主人
---

# dsh-task-board run.status 状态机缺推进路径（套件侧 bug 观察 + 运维清理工具）

## 一、bug 现象

2026-09-11 主人重启 dsh-desktop 后实测发现：

- 看板「今日待办」面板**无可见内容**——所有 task.status 都是「已完成」/「成功」等终态；
- 但 `/dsh-task-board/state` 接口实际返回 **18 项 run.status === 待审批**；
- `/dsh-ledger/approvals` 返回 `[]`——**ledger 服务无待审批令牌**；
- 18 项 run 在 `home\dsh-task-board\ledger.json` 中**永久残留**；
- 任何 `task_approve` / `confirm` 推送**都不改变** run 状态——状态机缺失推进路径。

## 二、根因（套件侧代码定位）

`github.com/lomehong/dsh-task-board 仓 src/ledger.ts` 第 21–69 行定义 `RunRecord.status` 字段，类型 `'运行中' | '成功' | '失败' | '已取消' | '待审批' | '已阻断' | '待确认'`；**但同文件没有任何 `setRunStatus` / `updateRun` / `advanceRun` 之类函数**——`updateTask` / `setArchived` / `deleteTask` 只动 task 级字段。`/dsh-task-board/action` 端点的 `case 'confirm'` 推进的是 `task.status`（用于「待确认」语义），**不是 run.status**。

→ **run.status 一旦设为「待审批」就无 API 可推进**，除非重启时 reset（实测未发生）。

这与 dsh-task-board `R3 待审批` 在 R9 套件分析（ceaff0d 案例 1）里的判断一致：run.status 状态机不闭合。

## 三、运维清理工具（大脑仓提供，不修套件代码）

`scripts/task-board-cleanup.mjs`（大脑仓 `scripts/`，跨仓复用工具）：

```bash
# 默认 dry-run，列出待清理项
node scripts/task-board-cleanup.mjs

# 显式 --apply 才写入；写入前自动备份到 ledger.json.bak-<ts>
node scripts/task-board-cleanup.mjs --apply --yes
```

行为：
1. 读 `home\dsh-task-board\ledger.json`；
2. 扫描 `tasks[].runs[]` 找 status === 待审批；
3. **dry-run** 仅打印清单（exit 0）；
4. **--apply** 备份原文件 → 把每条脏 run.status 改为「已取消」、补 finishedAt 与运维备注（含 bug 引用）→ 原子写（临时文件 + rename）→ revision++ → 输出回滚命令；
5. `--selftest` 红绿夹具（dry-run 不改 / apply 推进 + 备份可恢复）。

**不**做的事：①不调 ledger 服务（已确认无令牌）；②不直接编辑 task.status（与 bug 无关）；③不做自动定时清理（运维脚本，需人工触发）。

## 四、为什么放大脑仓实践条目而不是 principle

**职责分工**（D9）：
- **bug 修在套件侧**（dsh-task-board 仓）——大脑仓无修复权；
- **运维工具在大脑仓**（scripts/）——跨仓复用的运维工具集中地，方便主人/套件会话调用；
- **实践条目记录观察**（不写原理变更）——避免大脑仓越权「定义」套件行为。

## 五、修复建议（供套件侧 PR）

`github.com/lomehong/dsh-task-board 仓 src/ledger.ts` 新增：

```ts
export function advanceRun(taskId: string, runId: string, status: RunStatus, summary?: string): RunRecord | undefined
```

并导出到 `/dsh-task-board/action` 路由（如 `type: 'advance-run'`），或与现有 `case 'confirm'` 共用。**清理脚本不再需要——run 状态机闭合后脏数据自然消失**。

## 六、清理建议（短中期）

主人重启 dsh-desktop **前**，建议在清理脚本里执行一次 `--apply`，确认 18 项归零（或明确选择性清理）；之后重启，前端与 `/state` 一致。
