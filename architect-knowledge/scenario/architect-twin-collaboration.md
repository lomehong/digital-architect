---
title: 场景映射：架构师 Agent 与数字分身经御驿协同
domain: dsh-ecosystem
source:
  origin: 主人指示（2026-09-10，决策 D10）+ digital-twin/docs/suite-charter.md §0
  ref: dsh-yuyi 以 submodule 双总仓共享；架构师 Agent 可与数字分身通过 yuyi 通讯
confirmed: 2026-09-10
status: 已确认
owner: 主人
---

# 场景映射：架构师 Agent 与数字分身经御驿协同

**场景**：架构师 Agent（运行在本总仓语境/任意宿主，见 D9）需要与数字分身协同——提出需求、委派执行、收回结果、验收回流。
**通道**：御驿（dsh-yuyi）——跨设备/跨 Agent 的通信底座。**dsh-yuyi 以 submodule 双总仓共享**：digital-twin 侧服务分身，digital-architect 侧服务架构师，同一协议、两份独立指针。

## 协同映射（场景 → 通道/机制）

| 协同动作 | 通道 | 机制/纪律 |
|---|---|---|
| 架构师 → 分身：委派方案落地任务 | yuyi 发消息/任务链（收件方为分身所在宿主） | 委派内容必须带任务号与可验收条目；分身侧仍走 task_delegate/claim 治理语义 |
| 架构师 → 分身：追问执行现场 | yuyi 消息 | 分身活动权威是看板（`dsh-task-board` activity），架构师问询以看板为准，消息只做触发 |
| 分身 → 架构师：回报执行结果 | yuyi 回消息 + task_report 自报 | **自报 ≠ 完成**：结果回流后仍须主人确认才落定 |
| 主人验收回流 | 主人在分身侧今日待办确认 | 架构师侧同步更新方案 status 与知识回灌 |

## 角色纪律（协同中不变）

1. 架构师**不是第二只分身**——不代分身执行、不代主人确认（HANDOFF §9）；
2. 跨 Agent 委派属 **Cross-team Commitment** 决策门：架构师发起委派前属正常流程，但涉及对外承诺/高风险时仍按账本分级走主人审批；
3. 通讯经 yuyi 的双方身份由各自宿主基线自持（渠道 userId / master 语义），不因协同互相假定身份。

## 工程事实

- dsh-yuyi 是套件零耦合标杆（宪章 §4）：只面向宿主服务编程——本总仓以 submodule 引用同一仓，不复制代码、不建分叉；
- 架构师侧使用 yuyi 的入口按宿主适配文件（`adapters/<host>.md`）映射：dsh 宿主下即 `dsh-yuyi/tools` 提供的模型工具；其余宿主经对应适配层接入；
- 两总仓指针独立演进：一侧升级 yuyi 版本不自动带动另一侧，协同协议兼容性由信封/JCS 签名的协议核心保证（Yuyi 仓 M0 层）。
