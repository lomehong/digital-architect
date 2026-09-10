# 可执行技术方案：service-knowledge 三仓试点（knowledge-lint 后的系统层知识面）

```yaml
---
title: service-knowledge 三仓试点（dsh-twin / dsh-task-board / dsh-memory）
status: 已落定
requirement: docs/designs/2026-09-10-service-knowledge三仓试点-需求包.md
author: 本建设会话（architect-design 代跑）
created: 2026-09-10
review:
  score: 58
  conclusion: 通过（2026-09-10 architect-review 58/60；主人 2026-09-10 五问验收确认，已落定）
---
```

## 0. 一句话与五问速答

| 五问 | 速答 |
|---|---|
| 改哪里？ | digital-twin 三仓各增 `AGENTS.md` + `.knowledge/`×4 YAML（纯增量）；本仓 architecture-map 补 3 行索引 + 走查记录落 docs/designs；知识库内容零改动 |
| 为什么改？ | 母包缺口 G2：影响面分析靠人读宪章矩阵；文章 §5.5 系统层知识（就近发现、多仓 context、YAML 高密度）落地 |
| 影响谁？ | 三仓获得系统层知识面（构建/运行零影响）；twin 会话 coding agent 可经 AGENTS.md 就近发现（增益）；本仓 map 索引 +3 行 |
| 如何验证？ | YAML 可解析 + schema 字段齐 + 每仓 3 处 source 符号回源抽查 + 影响面走查（知识路径完成）+ 字节数对照 |
| 还有什么没有确认？ | Q1 落点、Q2 执行方式（随本方案拍板）；U1 token 估算口径、U2 宪章登记落点 |

## 1. 需求覆盖（Do / Don't / To Confirm）

### Do

| # | 需求条目 | 方案响应 | 来源 |
|---|---|---|---|
| 1 | 四 facet schema（`schema: 1` 防漂移〔评审补正〕，每条事实带 source） | 见下方 schema 表 | 目标 2 |
| 2 | AGENTS.md 路由规范 | ≤40 行：仓一句话 / 目录结构 / `.knowledge/` 四文件各一行索引 / 红线指针（宪章 §0、守卫纪律）/ 构建测试命令 | Do-1 |
| 3 | 逐仓生成（读源→蒸馏→落盘→提交） | 顺序：dsh-memory（最熟，被消费最多）→ dsh-task-board → dsh-twin（最大）；每仓完成即独立提交 | Do-1 |
| 4 | 登记义务 | 本仓 map 补 3 行（引用不复制）；宪章登记落点实读后定（U2） | 目标 4 |
| 5 | 影响面走查 + 字节数对照 | 场景「entries API 增字段」：知识路径（读 3×AGENTS.md + 命中 .knowledge + ≤2 处回源）vs 传统路径（3×README + grep）记录加载字节数 | 目标 3 |

**四 facet schema（`status: 待审核` 起步，主人确认升级；`sources` 数组每项为 `文件:符号`）**：

| 文件 | 字段 | 回答的问题 |
|---|---|---|
| `role.yaml` | service / domain / role / capabilities[] / not_doing[] / schema / status / confirmed / sources[] | 这个服务负责什么、明确不做什么 |
| `interfaces.yaml` | services[]: {name, kind(cordis-service·model-tool·http·event), summary, source} | 对外面有什么、在哪定义 |
| `dependencies.yaml` | consumes[]: {name, kind, degradation} / consumed_by[]: {name, source}；**跨仓事实（consumed_by 等）的 source 指向消费方仓的 `文件:符号`，走查时跨仓核对**〔评审补正，2026-09-10〕 | 依赖谁、被谁消费、缺席降级 |
| `constraints.yaml` | state_machines[] / red_lines[] / test_entry / compat_notes[]（各带 source） | 怎么改才安全（主路径 vs 历史兼容） |

### Don't

| # | 排除项 | 排除原因 |
|---|---|---|
| 1 | 改三仓代码/配置 | 纯文档面，不进 tsconfig/bundle |
| 2 | git hook 增量机制 | 试点先手工；机制化待走查数据支持后另立项 |
| 3 | 铺开其余 7 仓 | 试点先行（母包本意） |
| 4 | 复制宪章/架构图内容 | 引用不复制；跨仓事实指认到对方 |
| 5 | 精确 token 计量 | 无计量 instrumentation；以加载字节数为代理指标（U1 诚实登记） |

### To Confirm

| # | 待确认项 | 问谁 | 状态 |
|---|---|---|---|
| Q1 | 落点：三仓同仓 `.knowledge/`（推荐）vs 集中本仓 | 主人 | 挂起 |
| Q2 | 执行方式（推荐本会话直执） | 主人 | 挂起 |

## 2. 系统覆盖

| 系统 | 变更类型 | 关键依赖 | 缺席降级影响 |
|---|---|---|---|
| dsh-memory | 增（AGENTS.md + .knowledge/×4） | 无 | 无知识面→回退传统路径（现状） |
| dsh-task-board | 同上 | 无 | 同上 |
| dsh-twin | 同上 | 无 | 同上 |
| digital-architect | 增（map +3 行、走查记录） | 无 | — |
| 三仓构建链/CI | 不动（md/yaml 不触发 tsc/vitest） | — | — |

- 范围外：其余 7 仓、宪章正文（仅 U2 登记性改动）、federation 方案（正交）。
- 对照矩阵：无遗漏；**不适用项：MQ/缓存/发布边界**（纯静态文件）。

## 3. 证据覆盖

| 关键结论 | 类型 | 出处 |
|---|---|---|
| 三仓规模：35 src 文件 ≈7.5k 行（twin 11/3195、task-board 14/2190、memory 10/2154） | Code | 本会话 pwsh 实测（2026-09-10） |
| 三仓均无 AGENTS.md/.knowledge（干净起点） | Code | 同上实测 |
| member provides/consumes 与缺席降级语义 | Architecture | `reference/dsh-suite-architecture-map.md` 成员清单 + 宪章 §2（蒸馏起点，落盘前逐条以代码回源） |
| 系统层知识与就近发现价值 | Business | 文章 §5.5（原文快照 + 镜像交叉核对） |
| YAGNI 边界：hook/精确 token 计量不做 | Business | 文章 §5.5 hook 属远端异步维护；本仓无计量设施（诚实登记 U1） |

## 4. 风险覆盖

| 风险类 | 涉及 | 分析与对策 |
|---|---|---|
| Compatibility | 涉及 | 纯增量文件；**最大风险=知识内容错误误导后续 coding agent**（文章 §5.4「看似可信地误导」）→ 三重缓解：source 逐条可回源 + status 待审核 + 主人确认后升级 |
| Exception | 涉及 | 蒸馏中发现知识与代码冲突 → 走 `practice/knowledge-drift-cases.md` 流水线：先修知识再落盘，不带冲突出仓 |
| Cache 缓存 | 不适用 | 显式声明 |
| MQ 消息 | 不适用 | 显式声明 |
| State 状态机 | 不适用 | 文件无运行时状态（constraints.yaml 里「描述」他仓状态机，本身无状态） |
| Security 安全 | 不涉及 | 无凭据无网络；文件内容为仓内公开事实 |

## 5. 验证覆盖

| 手段 | 内容 | 可执行入口 |
|---|---|---|
| Unit 静态 | 四 YAML 可解析（node:fs + 手写受限解析或 json 校验）+ schema 字段齐 + `schema: 1` | pwsh/node 脚本（复用 knowledge-lint 思路，试点期人工执行） |
| Contract 回源 | 每仓抽 3 处 `文件:符号` 亲自读源核对 | 走查记录登记 |
| Regression 走查 | 「entries API 增字段」场景：知识路径完成影响面分析，记录读取文件清单与顺序（防作弊：先知识后回源） | 走查记录 |
| 对照 | 传统路径（3×README+定点 grep）加载字节数 vs 知识路径 | 走查记录（U1：字节数为代理指标） |
| Rollback | 三仓删 5 文件 + revert；本仓 revert map 行 | git revert |

## 6. 不确定性治理

| # | 类型 | 描述 | 处置 |
|---|---|---|---|
| 1 | Human Decision | Q1 落点 | 待主人（推荐同仓） |
| 2 | Human Decision | Q2 执行方式 | 待主人（推荐直执） |
| 3 | Unknown | U1 token 节约只能估算（字节数代理） | 走查记录如实登记口径 |
| 4 | Unknown | U2 twin 侧宪章登记落点 | 实读宪章后定；无对应登记处则在本仓 practice 留痕说明 |
| 5 | Human Decision | 方案评审与主人确认 | 待 architect-review + 主人五问 |

## 7. 任务拆解（落定后填）

| 任务 | 可验收条目 | 级别预期 |
|---|---|---|
| 阶段 1：dsh-memory 蒸馏 | 5 文件落盘 + 3 处回源过 + 提交推送 | L1 |
| 阶段 2：dsh-task-board 蒸馏 | 同上 | L1 |
| 阶段 3：dsh-twin 蒸馏 | 同上 | L1 |
| 阶段 4：走查 + 对照 + 登记 | 走查记录落 docs/designs；map +3 行；宪章登记（U2） | L1 |

## 8. 决策门记录

| 命中门 | 决策 | 决策人/时间 |
|---|---|---|
| Cross-team | 同财产线，未命中（A2） | — / 2026-09-10 |
| Compliance / High-risk | 纯文档增量，不适用 | — / 2026-09-10 |
| Q1 落点 | **已决：三仓同仓 `.knowledge/`**（ask_user） | 主人 / 2026-09-10 |
| Q2 执行方式 | **已决：本会话直接执行**（ask_user；读源蒸馏经并行子代理起草，本会话回源抽查后落盘） | 主人 / 2026-09-10 |
| 方案验收 | **通过，落定**（ask_user「通过，落定」） | 主人 / 2026-09-10 |

## 9. 执行与走查登记（2026-09-10，落定后补记）

| 阶段 | 结论 | 证据 |
|---|---|---|
| 1 dsh-memory | ✅ | 5 文件落盘 + 3 处回源过 + `c1aef7d` 推送 |
| 2 dsh-task-board | ✅ | 同上 + `56152b9` |
| 3 dsh-twin | ✅ | 同上 + `3246517` |
| 4 走查+对照+登记 | ✅ | 抽查 9/9 通过零编造；影响面场景 ≤2 回源达标；字节对照**如实记录为本规模不成立**（163.5%，价值改述为跨仓符号映射+可校验结构）；map +1 节；漂移发现 D1~D4 与 openloop/close 门禁项登记待主人裁决 |

- 走查明细：`2026-09-10-service-knowledge三仓试点-走查记录.md`；
- **自报 ≠ 完成**：15 文件待审核状态待主人确认升级；漂移处置与铺开决策待主人。
