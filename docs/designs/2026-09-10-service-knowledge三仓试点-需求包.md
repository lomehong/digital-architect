# 结构化需求包：service-knowledge 三仓试点（dsh-twin / dsh-task-board / dsh-memory，母包 P1-2）

> 产出者：architect-prd-digest（本建设会话代跑）· 日期：2026-09-10 · 宿主：dsh
> 需求来源：主人 2026-09-10 指示「继续」（母包：`docs/designs/2026-09-10-架构师Agent优化-需求包.md` §2 P1-2，缺口 G2）
> 方法论依据：文章 §5.5（service-knowledge 价值：就近发现 / 多服务 context / YAML 高密度；git hook 增量维护）+ §5.6（系统层=怎么安全改）
> 准入结论：**通过**（Q1 落点、Q2 执行方式待确认，不阻断方案起草）

---

## 1. 可验收目标

1. 三仓各新增 `AGENTS.md`（≤40 行路由入口）+ `.knowledge/` 四 YAML（role / interfaces / dependencies / constraints，schema 见技术方案 §1）——**纯增量，零代码零配置变更**；
2. 内容纪律：每条事实带 `source`（`文件:符号` 可回源）；蒸馏日 `confirmed`；新蒸馏标 `status: 待审核`，主人确认后升级；
3. 影响面分析走查：场景「dsh-memory 的 entries API 新增字段，影响谁、怎么安全改」——知识路径只读知识文件 + **≤2 处定点回源**完成，并与传统路径（读三仓 README + 源码 grep）做**加载字节数对照**（token 数只作估算，见 U1）；
4. 登记义务：本仓 `reference/dsh-suite-architecture-map.md` 补三仓知识面索引行（引用不复制）；twin 侧宪章登记落点按实读宪章后确定（U2）；
5. 主人五问验收。

## 2. 范围（Do）

- 逐仓生成流程：读源码 → 按 schema 蒸馏四 YAML → 写 AGENTS.md 路由 → git 中文提交推送；
- 每仓事实覆盖：职责与能力边界（role）/ 对外面（cordis 服务、模型工具、HTTP 路由、事件）（interfaces）/ 消费与被消费及缺席降级（dependencies）/ 状态机、红线、测试入口、历史兼容（constraints）。

## 3. 不做项（Don't）

- **不改三仓任何代码/配置**（`.knowledge/` 与 `AGENTS.md` 不进构建链，纯文档面）；
- **不做 git hook 增量维护**（文章 §5.5：hook 适合远端异步维护——试点先手工，机制化待验证后立项）；
- **不铺开其余 7 仓**（试点验证收益后再批量，母包本意）；
- **不复制宪章/架构图内容进 .knowledge**（引用不复制；知识只写本仓事实，跨仓关系指认到对方）；
- **不引入构建/运行时影响**（不进 tsconfig、不进 bundle）。

## 4. 假设

| # | 假设 | 依据 |
|---|---|---|
| A1 | 落点=与代码同仓（文章 §5.5 canonical：coding/方案/review 各阶段 agent 就近发现；增量 hook 的前提） | 母包 P1-2 表述即同仓形态；Q1 保留主人否决权 |
| A2 | 三仓与 twin 套件同属主人财产线，跨仓提交不构成跨团队门 | 御驿需求包先例；宪章登记义务照尽（Do-4） |

## 5. 阻断项

**无。**

## 6. 待确认（不阻断方案起草）

| # | 项 | 类型 | 处置 |
|---|---|---|---|
| Q1 | 落点：三仓各自 `.knowledge/`（推荐，文章 canonical）vs 集中本仓 `architect-knowledge/service-knowledge/` | Business Trade-off | 随方案评审 ask_user |
| Q2 | 执行方式（推荐：本会话直执——同 P0/P1-1 先例；需跨 3 仓提交） | Business Trade-off | 同上 |

## 7. 专项评审触发

Cross-team：同财产线 → 未命中（A2）；Compliance / High-risk：纯文档增量、无权限面 → 未命中。

## 8. 六项覆盖检查表

| # | 检查 | 结论 | 证据 |
|---|---|---|---|
| ① 需求覆盖 | ✅ | 母包 P1-2 全要素归属 Do；5 条显式不做 | §1/§2/§3 |
| ② 系统覆盖 | ✅ | 三仓（增 AGENTS.md + .knowledge/×4）、本仓（map +1 行、走查记录）；构建链零涉及；范围外：其余 7 仓、宪章正文（仅登记性改动，U2） | 技术方案 §2 |
| ③ 证据覆盖 | ✅ | 本会话实测：三仓 35 src 文件 ≈7.5k 行、均无 AGENTS.md/.knowledge（干净起点）；architecture map provides/consumes 表为蒸馏起点（落盘前逐条以代码回源） | 技术方案 §3 |
| ④ 风险覆盖 | ✅ | 兼容（纯增量；AGENTS.md 内容错误会误导后续 coding agent→待审核+确认+source 可回源三重缓解）；异常（回源冲突→知识漂移流程，先修知识再落盘）；安全（无凭据）；缓存/MQ 不适用 | 技术方案 §4 |
| ⑤ 验证覆盖 | ✅ | 静态（YAML 可解析+schema 字段齐+每仓 3 处 source 符号抽查）+ 影响面走查（知识路径 ≤N 文件）+ 字节数对照 + 回滚（删文件+revert） | 技术方案 §5 |
| ⑥ 不确定性治理 | ✅ | Q1/Q2 待主人；U1 token 数只估算（字节数为代理指标）；U2 宪章登记落点实读后定 | §6/技术方案 §6 |

## 9. 五问准入

| # | 问题 | 结论 |
|---|---|---|
| 1 | 问题与方案匹配？ | 问题找方案：G2（影响面分析靠人读宪章）由母包对照得出；三仓正是「多服务扫描」最小闭环 |
| 2 | 价值依据？ | 文章 §5.5（就近发现、多仓 context 压缩、实体/逻辑抽取省重复分析）；走查对照给出可检验证据 |
| 3 | 范围受控？ | 三仓、纯增量、5 条不做项；铺开与否由试点数据决定 |
| 4 | 可复用既有能力？ | architecture map provides/consumes 表（蒸馏起点）、宪章依赖矩阵、knowledge-lint 思路（结构校验）全部 Reuse |
| 5 | 可逆？ | 三仓各删 5 个文件 + revert 索引行即回滚；零代码零配置影响 |

## 10. 准入结论

**通过，可进入 architect-design。** 待确认 Q1（落点）、Q2（执行方式）随方案评审拍板。
