# 走查记录：service-knowledge 三仓试点（dsh-memory / dsh-task-board / dsh-twin）

> 执行：本建设会话（主人 2026-09-10 Q2 拍板「本会话直接执行」；读源蒸馏经 3 个并行子代理起草，本会话抽查把关后落盘）
> 方案：`2026-09-10-service-knowledge三仓试点-技术方案.md`（已落定，Q1 已决同仓落点）
> 纪律：**自报 ≠ 完成**——本记录为自报，待主人确认后终态并回灌 `practice/`。

## 抽查把关（Contract：每仓 3 处 source 亲自回源）——9/9 通过，零编造

| 仓 | 抽查 | 结果 |
|---|---|---|
| dsh-memory | ①`memory-api.ts` token 门禁+Origin 同源（L39-67）②`memory-store.ts` 替代链双向链接（L26/59/61）③`MAX_ENTRIES=500` 淘汰优先级（L138/355） | 全属实 |
| dsh-task-board | ①`index.ts` M-3 服务面收敛（L178-180）②`report.ts` 待确认+接管留痕（L66-79）③`governance.ts` L2 拦截/L3 拒绝（L19-21） | 全属实 |
| dsh-twin | ①`GUARD_TEXT` L241②`PRESET_VERSION='11'` L439③`resolveGuestView` fail-closed L1402-1412 | 全属实 |

子代理质量信号：三代理均**纠正了任务书线索偏差**（task-board：action 含 create、ledger/memory 实为被消费方；memory：noteActor 属 twin 不属本仓；twin：PRESET_VERSION 以代码为准）——「宁可少写不可编造」纪律生效。

## 阶段 4 走查：场景「dsh-memory entries API 新增字段，影响谁、怎么安全改」

- **知识路径**（读 10 文件：3×AGENTS.md + memory 四 YAML + task-board interfaces/dependencies/constraints）完成作答：
  - 影响面：HTTP POST /entries（管理页/浏览器，固定 author=admin）；服务面 addMemoryEntry 消费方 = task-board:recordTaskOutcome、twin:seedMemory/consolidateMemory；assemble 路由独立不经 entries；yuyi 仅提示词层引用；
  - 安改约束：陈述类变更必须走替代链禁止原地覆盖 / 默认事实+master scope / token 门禁+同源 / MAX 500 淘汰优先级 / UTC 存储 / fail-closed 装配；
  - 定点回源 2 处（≤2 限值达标）：`src/memory-api.ts:registerMemoryApi`、`src/memory-store.ts:normalizeEntryEpistemics`。
- **字节对照（U1 口径：字节数为代理指标）——如实呈报**：

| 路径 | 字节 |
|---|---|
| 知识路径（10 文件） | 33,372 |
| 传统路径（3×README，不含 grep/读码成本） | 20,416（9,271+980+10,165） |

**结论：字节指标在本试点规模不成立（163.5%）**——task-board README 仅 980 字节，且我们的知识面更厚（跨仓 consumed_by 逐符号映射、红线/状态机/兼容注意，README 均不含）。文章 §5.5 的 token 节约前提是 >5 万行×多服务；本项目 3 仓 7.5k 行低于该阈值。**试点的真实收益 = 跨仓符号级影响面可直接作答 + 结构可机械校验 + 安改红线内联**；铺开其余 7 仓的决策应基于此而非字节节约（建议：按需蒸馏高频改动仓，暂不全量铺开）。

## 漂移与矛盾发现（走查副产品，均已在 gaps 登记）

| # | 发现 | 处置建议 |
|---|---|---|
| D1 | dsh-memory README L55 仍写旧路径 `~/.dsh/im-channel/credentials/`（宪章 §5-02 已整改迁移，文档未更） | twin 线修 README；本会话不代劳（超出 P1-2 增量边界） |
| D2 | dsh-twin README v0.3.0 与 package.json 0.4.1 漂移；「不挂 shell/fs」与预设现状矛盾 | 同上 |
| D3 | dsh-twin `noteActor` L224 注释「未标注=主人视图」与 `resolveGuestView` fail-closed 实现矛盾（以实现为准） | twin 线修注释 |
| D4 | dsh-twin `proactive.ts:deliverReach` 注释「过闸失败宁可降级不直发」与实现（账本缺席继续投递）不一致 | twin 线裁决：改实现还是改注释 |

## 安全待裁决项（走查顺带发现）

`POST /dsh-memory/openloop/close` 仅有同源校验、无 x-memory-token 门禁（与同文件 assemble 路由不一致）——是否属待整改项，登记待主人裁决（constraints.yaml gaps 已注明）。

## 静态校验

15 文件齐（3×AGENTS.md + 12 YAML）；schema: 1 / status: 待审核 / gaps 齐、role 带 sources；无 TAB。校验脚本为试点期人工执行（knowledge-lint 尚不覆盖 .knowledge schema——母包挂起项）。

## 提交记录

| 仓 | 提交 |
|---|---|
| dsh-memory | `c1aef7d` |
| dsh-task-board | `56152b9` |
| dsh-twin | `3246517` |

## 待主人确认（自报 ≠ 完成）

- [x] 15 个知识文件 `status: 待审核` 升级确认——**已确认（2026-09-10，主人回复「确认没有问题」）**：12 个 YAML 升级 `已确认`（AGENTS.md 无 status 字段），三仓确认提交 65c5a9f / 5e98e76 / 5cd62cd；
- [x] D1~D4 漂移处置归属——**已确认：转 twin 线文档维护**，本仓走查记录留痕，不代劳；
- [x] openloop/close 门禁整改裁决——**已确认：登记知悉，转 twin 线评估整改**（本会话不改代码）；
- [x] 试点结论验收——**已确认：按需蒸馏高频改动仓，不全量铺开**。

## 确认记录（2026-09-10，主人回复「确认没有问题」）

1. ✅ 15 文件升级已确认（三仓 65c5a9f / 5e98e76 / 5cd62cd）；
2. ✅ D1~D4 + openloop/close 处置按走查建议落定（twin 线承接）；
3. ✅ 铺开取向 = 按需蒸馏；
4. ➕ Knowledge Evolution 回灌：`practice/service-knowledge-distill-lessons.md`（三教训：委托-把关模式 / 字节指标诚实结论 / 蒸馏即漂移探测；`status: 待审核`，待主人下次确认升级）。
