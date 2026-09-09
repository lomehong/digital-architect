---
name: architect-design
description: 架构师设计主流程：按渐进式披露四层装载知识（业务层→架构层→系统层→基建层）→ 架构链路分析 → Gap Analysis → 按六维度+五问产出可执行技术方案。人工决策门走 ask_user 与账本审批。
whenToUse: 需求准入（architect-prd-digest）通过后，主人要求「出技术方案」「做设计」「architect-design」时使用；产出交 architect-review 评审。
---

# architect-design · 设计主流程

你承担架构师 Agent 的**技术方案设计**职能（流水线阶段 2~8+10，见 `architect-knowledge/scenario/architect-design-pipeline.md`）。前置条件：已有 architect-prd-digest 产出的**结构化需求包**（没有则先回退跑准入）。

## 流程

### 第一步：渐进式披露四层装载（Broad → Focused → Concrete）

按序装载，只加载当前判断所需知识：

1. **业务层（为什么改）**：读需求包 + `architect-knowledge/meta/` + `scenario/` 命中条目 + `practice/` 历史原因条目；
2. **架构层（影响谁）**：读 `architect-knowledge/reference/dsh-suite-architecture-map.md` + `principle/suite-federation-principles.md`，列出受影响服务/插件/数据面与缺席降级面；
3. **系统层（怎么安全改）**：对受影响仓库读其 README/AGENTS.md/源码——**当前行为以代码为准**；对照 `principle/` 命中原则；
4. **基建层（工程底线）**：按变更类型核对中间件/发布/安全/可观测性底线（宿主端口、DSH_HOME 布局、bundle 挂载、权限分级）。

每层装载后在方案「证据覆盖」区记录：读了什么、确认了什么、与知识库是否冲突（冲突→走知识漂移流程 `practice/knowledge-drift-cases.md`）。

### 第二步：架构链路分析

- 画出调用链/数据流（谁调用谁、数据主责、一致性边界、强弱依赖）；
- 影响面分析：改动波及的插件/会话/渠道/存储；每项增强缺席时的降级行为是否被破坏；
- 守卫纪律与访客可见性红线检查（凡涉及会话/渠道/活动视图的改动）。

### 第三步：Gap Analysis（先复用）

对照 `reference/dsh-suite-architecture-map.md` 逐项判定：**Reuse**（直接用既有能力）/ **Extend**（扩展既有插件）/ **Build**（确需新建）。选 Build 必须给出 Reuse/Extend 不可行的证据。

### 第四步：方案起草（六维度）

用 `templates/executable-design.md` 为骨架起草，六维度逐项填写，不适用也必须显式写「不适用 + 原因」：

需求覆盖（Do/Don't/To Confirm）、系统覆盖（Services/Repos/Dependencies）、证据覆盖（Business/Architecture/Code/Config）、风险覆盖（Compatibility/Exception/Cache/MQ/State）、验证覆盖（Unit/Contract/Regression/Monitoring/Rollback）、不确定性治理（Unknown/Conflict/Human Decision）。

### 第五步：人工决策门

六类门（Unknown/Conflict/Business Trade-off/Cross-team Commitment/Compliance/High-risk Change）任何一类命中即停：
- 会话内用 ask_user 向主人提问（带你的倾向建议与理由）；
- 治理类（高风险变更/合规/对外行动）→ 提示该任务立项后将触发账本 L2+ 审批，由主人在今日待办批准。

### 第六步：证据与覆盖自检

- 五问自答：改哪里？为什么改？影响谁？如何验证？还有什么没有确认？
- 每个未知/待验证项都在「不确定性治理」区显式登记——**不得编造补全**。

### 第七步：产出与落定

1. 技术方案写入主人指定位置（默认 `docs/designs/<slug>.md`），文件头标注来源需求包路径；
2. 方案经 architect-review 通过、主人确认后，把六维度内容**拆解为看板任务**（task_delegate 立项，任务描述含可验收条目）；
3. 执行结果回流后，把新经验回灌 `architect-knowledge/practice/`（Knowledge Evolution）。

## 停止条件

- 四层装载发现知识库与代码冲突且无法裁决 → 停，走 ask_user；
- 决策门未清 → 停，不得带未决事项出方案；
- Gap Analysis 全部命中既有能力且改动为零 → 产出「无需开发」结论，直接进入验收。
