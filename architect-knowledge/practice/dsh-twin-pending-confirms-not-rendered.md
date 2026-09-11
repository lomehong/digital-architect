---
title: dsh-twin 活动视图漏渲染 pendingConfirms（宿主侧 bug 观察）
domain: dsh-ecosystem
source:
  origin: 主人 2026-09-11 实测——重启 dsh-desktop 后「今日待办」面板仍漏显示 1 项 task-board run 的「待确认」状态（TB-1789095261962-r4ach）；`/state` 返回 1 项但活动面板无渲染
  ref: github.com/lomehong/dsh-twin
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# dsh-twin 活动视图漏渲染 pendingConfirms（宿主侧 bug 观察）

## 一、bug 现象

2026-09-11 主人重启 dsh-desktop 实测：清场 18 项「待审批」run 后，`/state` 仍返回 **1 项「待确认」run**（TB-1789095261962-r4ach），但「今日待办」面板**没有可见按钮可确认**。

## 二、根因（宿主侧代码定位）

`github.com/lomehong/dsh-twin 仓 src/activity.ts` 第 75 行：

```ts
if (pendingApprovals.length > 0) {
  lines.push(`- 待主人审批 ${pendingApprovals.length} 项：...（主人说"同意"即批准）`)
}
```

`pendingApprovals` 是从 **dsh-ledger**（`approve.ts`）拉的——管 L2+/L3 动作的待审令牌。

`pendingConfirms`（**dsh-task-board** 的「待确认」run，task 自报后主人需点确认）是**另一条通道**——`/state` 接口有数据，dsh-twin 的 `BoardActivity` 接口**应该有但代码未渲染**。

→ 这是两个独立通道：**dsh-ledger 通道**与 **dsh-task-board 通道**。dsh-twin 的活动视图只接了前者，后者数据被丢弃。

## 三、与前一条 bug 的区别

`practice/dsh-task-board-run-stuck.md`（套件侧：run.status 状态机缺推进路径）→ 套件侧 dsh-task-board 仓的问题。
**本条**（宿主侧：activity 漏渲染 pendingConfirms）→ 套件侧 dsh-twin 仓的问题。

两者**责任主体不同**——不能合并。

## 四、临时绕路与永久修复

**临时绕路**（已用）：手动 `curl /dsh-task-board/action type=confirm` 推进那 1 项 run（确认 run.status 虽无 API 推进，但 `case 'confirm'` 端点推进的是 `task.status`——本次 `task.status === '待确认'` 0 → 推进后 task 状态进入终态）。

**永久修复**（套件侧 PR）：`dsh-twin/src/activity.ts` 加 `pendingConfirms` 渲染块，**数据来源**= `boardActivity.pendingConfirms`（需 dsh-task-board 的 `BoardActivityProvider.activity()` 返回该字段——若当前未提供，需在 dsh-task-board `src/index.ts` 的 activity 收集器里补）：

```ts
// dsh-twin/src/activity.ts（建议新增）
if (pendingConfirms.length > 0) {
  lines.push(`- 待主人确认 ${pendingConfirms.length} 项：${pendingConfirms.map(t => `〈${t.title}〉（任务号 ${t.taskId}，主人点确认即落定）`).join('、')}`)
}
```

## 五、为什么放大脑仓实践条目而不是 principle

与 `dsh-task-board-run-stuck.md` 同理：
- **bug 修在套件侧**（dsh-twin 仓）——大脑仓无修复权；
- **观察记录在大脑仓**——便于跨仓追踪、后续回归用例；
- **避免越权「定义」套件行为**。
