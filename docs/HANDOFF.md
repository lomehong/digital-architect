# 架构师 Agent · 项目交接文档

> 交接日期：2026-09-09 · 交接自：数字分身套件建设会话（「安装dsh数字分身插件套件」）
> 交接至：digital-architect 新会话（本文档为唯一上下文来源，自包含）
> 状态：设计已定稿、阶段 1 未开工——本文档第 6 节是下一步的执行清单

---

## 0. 一句话

基于**数字分身套件已有的 Harness 机制**（任务看板/账本治理/共享记忆/守卫纪律/验收语义）+ **两篇方法论文章**（阿里技术《AI Friendly 后端架构》与《架构师 Agent 系统化落地》），搭建**架构师 Agent**——从架构师核心职能「技术方案设计」切入，让 AI 完成跨复杂系统的技术方案设计。

---

## 1. 背景与动机

### 1.1 来源

用户（主人）在数字分身套件建设完成后，研读了阿里技术刘瑞洲的两篇系列文章：

1. **《后端架构 AI Friendly 的标准与路径：面向无人值守开发时代的系统重构》**（阿里技术，2026-06-15）——六类机器可读事实、Architecture Map、System Card、领域显式化、SKILL 化、Harness 七层轨道、测试=交通信号灯、AI-Observable、L0-L5 权限分级。
2. **《【AI 创新实践】"架构师 Agent" 系统化落地》**（千问AI平台，2026-09-09）——Context Gap 模型、四类断裂知识、业界三路线（Spec-Driven/长程 Harness/Agent-friendly Repo）、business-knowledge 五类结构、RAG 反直觉、渐进式披露四层、prd-digest 需求准入六项覆盖、架构推理 Runtime 全流水线、可执行技术方案六维度+五问。

两篇文章**已提炼入库**（数字分身套件的 dsh-memory，条目 ID 见 §3.4），图示已多模态解读并并入条目。

### 1.2 目标

让大型存量分布式系统成为 AI 可理解、可推理、可验证的工程系统，使 AI Agent 能完成**技术方案设计**（架构师核心职能），进而迈向 7×24 无人值守。**第一个落地区域：我们自己的数字分身套件与 dsh 宿主**（自举——知识源全在手边）。

---

## 2. 已有成果：数字分身套件（Harness 底座，可直接复用）

### 2.1 套件位置与形态

| 项 | 值 |
|---|---|
| 套件根 | `E:\Development\Code\nodejs\digital-twin`（git 管理，remote=github.com/lomehong/*，全部已同步） |
| 子仓库（10 个） | dsh-twin（数字分身宿主插件）、dsh-task-board（任务看板）、dsh-memory（共享记忆）、dsh-ledger（委托账本）、dsh-im-bot（IM 渠道，含 ui-settings-im）、dsh-actors（关系档案）、dsh-redact（脱敏）、dsh-regression（影子测试/回归）、dsh-computer（电脑操作）、dsh-yuyi（御驿消息） |
| 套件宪章 | `E:\Development\Code\nodejs\digital-twin\docs\suite-charter.md`（**套件的 Architecture Map**——四原则/依赖矩阵/五批整改记录/插件清单） |
| 桌面宿主 | dsh-desktop（Tauri 应用），核心版本 **0.1.5-alpha.2**，web 端口**已固定为 3088**（dsh-desktop 项目另一 Agent 实现的固定端口功能） |
| 家目录（DSH_HOME） | `C:\Users\lome\AppData\Local\dsh-desktop-app-data\home` |
| web profile | `home\profiles\web\package.json`（dsh.profile.bundles 列全部 14 个 bundle；插件经 junction/link 指向套件源码仓） |
| 插件安装方式 | bundle 方式（cordis.patch.yml），源码仓即安装源（link/junction） |
| 宿主 HTTP 基址 | `http://127.0.0.1:3088`（web 会话 cookie 认证；`?token=` 首次引导，token 在 `dsh-desktop.log` 尾部 `dsh web:` 行） |

### 2.2 可复用的 Harness 机制（架构师 Agent 直接踩在上面）

| 机制 | 实现 | 架构师 Agent 用途 |
|---|---|---|
| 任务生命周期 | dsh-task-board：立项(task_delegate)→认领(task_claim)→执行→自报(task_report)→**主人确认**(今日待办 confirm)→记忆沉淀 | 方案拆解后的任务执行与验收轨道 |
| 治理账本 | dsh-ledger：L0-L3 动作裁决（dependencies 显式声明的 schemastery 等依赖；L2+ 人工审批=3 分钟令牌+今日待办批准+30 天授权） | **人工决策门**（高风险变更/合规） |
| 验收语义 | **自报 ≠ 完成**：task_report 自报→「待确认」→主人确认才落定；替代语义更新保留历史 | 方案/知识的验收闭环 |
| 共享记忆 | dsh-memory：条目 {content/type/scope/statementType/source{origin,ref}/verify}；master/self/public 可见性；**memoryAssemblePerTurn=true**（每轮自动装配相关记忆进上下文） | 知识条目的存储与检索 |
| 记忆 HTTP | `GET/POST /dsh-memory/entries`（POST 需 `x-memory-token`，先 GET `/dsh-memory/token`）、`POST /dsh-memory/entries/update`（替代语义：更新产生新条目、历史保留）、`GET /dsh-memory/token` | 知识库读写通道 |
| 守卫纪律 | dsh-twin `src/index.ts` 的 GUARD_TEXT（每轮注入所有分身会话）：输出门禁三问/看板任务纪律（认领→干活→自报）/权限边界 | 行为约束层 |
| 验收闭环 | 阶段化按钮（已完成无执行/进行中只读）+ 启动对账（僵尸 run 清算）+ 滞留兜底（6h） | 状态机健康 |
| 浏览器桥 | Lum1104/dsh-browser 已装（桥插件 bundle + Chrome 扩展 `home\browser-extension`，扩展地址设置一次即持久）：真实浏览器操控、文本快照、免 token 回环 | 外部知识采集（公众号等） |
| 多模态 | 宿主支持图片附件（会话直接发图）；`read_image` 工具读本地图片文件 | 图示/截图解读 |
| 双写面板 | alpha.2 面板 API（main/sidebar.panellist）特性检测双写已就位：数字分身/任务看板/记忆三个侧边栏面板随宿主升级自动点亮 | UI 呈现 |

### 2.3 已验证的运行事实（2026-09-09）

- 核心升级 alpha.1→alpha.2：桌面版自愈自动完成；**persona schema 收紧**（config.text 废弃→要求 prefix）已修复（dsh-twin PRESET_VERSION 10，重新物化完成）。
- 桌面版自愈重装 profile 插件依赖时 **peer 物化不稳定**：dsh-computer/dsh-redact/dsh-yuyi 已把 `@deepseek-ai/schemastery ^3.18.2` 落为 dependencies（根治，已提交推送）。
- 套件 CI/发布链路已由并行会话建成（GitHub Actions 构建→审计→Release；dsh-twin v0.4.0 等标签）。
- 客户端面板 API：alpha.2 起 `conversation` slot 迁移为 `main` 的 conversation key；三插件已做**特性检测双写**（旧 slot + 新 main/panellist 并存，宿主到 alpha.2 自动点亮）。

---

## 3. 方法论基座（两篇文章的蒸馏，已入库可检索）

### 3.1 知识条目位置

dsh-memory（master 范围，statementType=事实）：

| 条目 | ID | 内容 |
|---|---|---|
| AI Friendly 后端架构 | `mem_1788977700115_gfp0ro` | 2293→4819 字（含六项覆盖+图示解读） |
| 架构师 Agent 系统化落地 | `mem_1788978083156_yycfzp` | 同一替代链的最新版（含六项覆盖补全+图示知识） |

> 注意：替代语义下两篇文章的条目链有交叉演化（第二条的更新替代了部分内容），以 entries 列表中**最新可见版本**为准。读取方式：`GET http://127.0.0.1:3088/dsh-memory/entries`（带 `x-memory-token` 头，token 经 `GET /dsh-memory/token` + web 会话获取）。

### 3.2 核心方法论速览（写 SKILL/知识库时的依据）

**痛点模型**：AI 在复杂存量系统的典型错误是「局部正确、整体错误」——根源是关键知识（历史包袱/兼容原因/隐性约束）不在代码里，散落于方案/复盘/经验/未成文约定。四类断裂知识：业务知识（业务语言≠代码命名）、架构知识（链路/数据主责/一致性边界）、服务内部知识（契约/状态机/主路径 vs 历史兼容）、工程组织知识（超时/灰度/发布/回滚）。

**业界三路线**：Spec-Driven（Spec→Plan→Tasks→Implement）、长程 Agent Harness（结构化交接解决上下文连续性）、Agent-friendly Repo（AGENTS.md 路由 + 结构化文档承载事实 + CI 发现知识漂移）——均偏单服务内部；**跨复杂多系统的工业实践是空白，即本项目的定位**。

**知识库第一层不是 RAG 而是领域**：RAG 三问题（颗粒度不一致/语义相似≠工程相关/TopK 无结构性保证）。知识有结构应结构化索引；信息类内容（新闻）才适合平铺检索。**固定结构 = 知识覆盖约束**（告诉 AI 必须理解什么），RAG 只是扩展检索。

**business-knowledge 五类结构**（以领域为边界，蒸馏架构师大脑）：
- `meta/`：业务元语、核心对象、别名、非同义词、边界
- `principle/`：幂等、一致性、超时、兼容、降级等跨场景原则
- `scenario/`：业务场景 → API/服务/数据/消息/异常/补偿 的映射
- `practice/`：历史决策、事故教训、兼容原因、可复用模式
- `reference/`：与其他领域的关系和契约（不复制对方知识）
- 维护：日常增量（关键变化触发蒸馏，未确认标待审核）+ 周期校准（大促/复盘资料）；每条知识带来源/确认时间/适用范围/负责人

**渐进式披露四层**：业务层（为什么改——business-knowledge，低频）→ 架构层（影响谁——服务图谱/链路分析）→ 系统层（怎么安全改——service-knowledge/AGENTS.md）→ 基建层（工程底线——中间件/发布/安全，静态）。**不同事实回不同来源确认**（当前行为以代码为准、业务意图以确认的知识为准、历史原因以实践记录为准），主动发现「知识漂移」。

**架构推理 Runtime 流水线（图 7）**：PRD → 需求准入(Scope/Acceptance/Unknowns) → 业务语义理解(Meta/Scenario) → 架构链路分析(Service Graph/Call Chain/Impact Analysis) → 服务知识加载(AGENTS.md/.knowledge) → 代码与配置核查 → Gap Analysis(Reuse/Extend/Build) → 技术方案(Change Scope/Impact/Compatibility/Exception/Test/Release) → 证据与覆盖检查 → 可执行技术方案。**人工决策门**：Unknown/Conflict/Business Trade-off/Cross-team Commitment/Compliance/High-risk Change。三支柱=Skill(稳定流程)+Harness(上下文/工具/停止条件/证据校验)+Foundation Model(推理/动态编排)。

**可执行技术方案六维度 + 五问**：需求覆盖(Do/Don't/To Confirm)、系统覆盖(Services/Repos/Dependencies)、证据覆盖(Business/Architecture/Code/Config)、风险覆盖(Compatibility/Exception/Cache/MQ/State)、验证覆盖(Unit/Contract/Regression/Monitoring/Rollback)、不确定性治理(Unknown/Conflict/Human Decision)。五问：改哪里？为什么改？影响谁？如何验证？还有什么没有确认？

---

## 4. 设计：架构师 Agent 架构（已定稿）

### 4.1 核心结论

**架构师 Agent ≠ 从零写新 Agent** = 数字分身已有 Harness（§2.2，不动）+ **三个新件**（缺口补齐）：

```
① architect-knowledge/（知识工程，文件树，git 管理）
   meta/ principle/ scenario/ practice/ reference/
   ——第一个领域 = dsh 生态自身（自举：宪章=Architecture Map，
      各仓 README=System Card 素材，两篇文章=方法论基座）

② 三个流程 SKILL（宿主原生 SKILL 机制，零代码）
   architect-prd-digest：需求准入 + 六项覆盖检查 → 结构化需求包
   architect-design：设计主流程（渐进披露四层装载 → Gap Analysis
     → 六维度方案产出），人工决策门走 ask_user/账本审批
   architect-review：五问检查 + 六维度覆盖评分

③ 产出规范：可执行技术方案模板（六维度+五问）
   方案落定 → 拆看板任务 → 认领执行 → 自报 → 确认 → 沉淀回灌
   （Knowledge Evolution：方案→任务→经验→知识库，文章闭环）
```

### 4.2 与已有机制的对接（零改造复用）

- **渐进式披露** = SKILL 里的分步阅读路径指令（按层 read 知识库文件）；
- **人工决策门** = ask_user（会话内）+ 账本审批（今日待办）——天然对应图 7 的人工决策六类门；
- **审计** = 任务看板 runs + memory 来源标注（已内建）；
- **Knowledge Evolution** = task_report 沉淀（已内建）。

### 4.3 关键设计决策（已与主人对齐）

| 决策 | 结论 |
|---|---|
| 载体 | 阶段 1 用 **SKILL 文件 + 知识库目录**（零代码、纯知识工程、符合文章 SKILL 化主张）；验证有效后阶段 3 再插件化 |
| 首个验证场景 | **自举**：「基于数字分身套件现状，设计知识库体系的技术方案」——跑流程的同时完成套件自身的知识蒸馏（一举两得） |
| 知识库位置 | 新项目工作区 `E:\Development\Code\nodejs\digital-architect\architect-knowledge\`（git 管理、可协作、随身携带） |
| 与数字分身关系 | 架构师 SKILL 挂在数字分身上（分身 = 执行 Harness；SKILL = 流程）——不是第二只分身，是分身的新能力 |

---

## 5. 新项目建议结构（digital-architect）

```
E:\Development\Code\nodejs\digital-architect\
├── docs\
│   └── HANDOFF.md                    ← 本文档
├── architect-knowledge\              ← 知识工程（五类结构，git 管理）
│   ├── meta\                         ← 业务元语/核心对象/别名/边界
│   ├── principle\                    ← 跨场景原则（幂等/一致性/兼容/降级…）
│   ├── scenario\                     ← 场景→技术映射
│   ├── practice\                     ← 历史决策/事故教训/模式
│   └── reference\                    ← 外部领域引用（不复制对方知识）
├── skills\
│   ├── architect-prd-digest\SKILL.md
│   ├── architect-design\SKILL.md
│   └── architect-review\SKILL.md
└── templates\
    └── executable-design.md          ← 六维度+五问方案模板
```

> 首个领域 = dsh 生态自身。知识蒸馏来源（全在手边）：
> ① `digital-twin\docs\suite-charter.md`（Architecture Map 级）
> ② 两篇文章条目（dsh-memory，见 §3.1，含图示解读）
> ③ 各仓 README + 本交接文档
> ④ 源码本身（10 仓，`service-knowledge` 阶段再系统生成）

---

## 6. 下一步执行清单（新会话从这里开始）

### 阶段 1 · 知识工程地基（纯文件，零代码）

1. `git init` digital-architect（如尚未初始化）+ 基础 README；
2. 建 `architect-knowledge/` 五类目录（§5 结构）；
3. **蒸馏首批知识**（把以下来源写进五类结构）：
   - 宪章（suite-charter.md）→ 架构事实/约束类条目
   - 两篇文章条目（dsh-memory 读取，见 §3.1）→ 方法论 principle/ practice 条目
   - 数字分身套件一个月建设历程（本文档 §2）→ practice 条目
   - 本交接文档 → meta 条目（项目边界/角色/决策）
4. 写 3 个 SKILL.md（architect-prd-digest / architect-design / architect-review，内容按 §4.1② 的流程与 §3.2 的方法论）；
5. 写 `templates/executable-design.md`（六维度+五问模板）；
6. git 提交推送（中文备注）。

### 阶段 2 · 自举首跑（验证流程）

1. 对分身发起：「用 architect-prd-digest 对需求『基于数字分身套件现状，设计知识库体系的技术方案』做需求准入」→ 检查结构化需求包；
2. 「用 architect-design 产出技术方案」→ 检查渐进披露装载（四层知识按序加载）与六维度覆盖；
3. 主人按五问验收 → 方案落定 → 拆看板任务执行（机制闭环）。

### 阶段 3 · 工具化（验证有效后拍板）

- dsh-architect 插件：结构化工具（architect_design/review/digest）+ 看板联动 + 覆盖检查自动化。

### 阶段 4 · 扩展

- service-knowledge 生成（对 dsh-desktop/dsh-go 等代码仓库建 System Card）；
- 公众号管道对接（外部知识持续蒸馏入 reference/practice）。

---

## 7. 风险与已知问题

| 风险 | 状态/对策 |
|---|---|
| 宿主 alpha 线迭代快（面板 API 已迁移） | 三插件双写已就位；升级前读 release notes，重点看 slots/panel/persona 变更 |
| 桌面版自愈重装 profile 依赖物化不稳定 | 已根治： schemastery 等宿主包导入一律落 dependencies（computer/redact/yuyi 已修；**新插件写 package.json 时直接声明 dependencies，勿依赖 peer 物化**） |
| 会话压缩后 session id 变化 | 看板接管语义已处理（task_claim 接管+审计；task_report 接管上报） |
| 微信反爬 | 服务端直抓会撞验证墙——公众号采集必须走浏览器桥（真实会话指纹） |
| SKILL 机制版本 | 宿主 skill-filesystem/tool-skill 在 alpha.2 正常；SKILL.md 格式参考宿主 `@deepseek-ai/dsh-skill-filesystem` 的既有技能样例 |

---

## 8. 关键文件与接口速查

| 项 | 路径/值 |
|---|---|
| 套件根 | `E:\Development\Code\nodejs\digital-twin` |
| 套件宪章 | `docs\suite-charter.md` |
| 守卫纪律源码 | `dsh-twin\src\index.ts`（GUARD_TEXT，约 L241） |
| 任务看板客户端 | `dsh-task-board\src\client\index.tsx`（双写面板注册样例，L458+） |
| 记忆 HTTP | `http://127.0.0.1:3088/dsh-memory/*`（token 流程见 §3.1） |
| 看板 HTTP | `http://127.0.0.1:3088/dsh-task-board/state` + `/action`（run/claim/confirm/archive/update/delete） |
| 桥配置探测 | `http://127.0.0.1:3088/ext/bridge-config` → `{"wsUrl":"ws://127.0.0.1:3088/ext/bridge"}` |
| 两篇文章知识条目 | dsh-memory（§3.1） |
| 宿主 persona schema 教训 | config.text 已废弃→必须 prefix（对齐 standard 预设；PRESET_VERSION 10） |
| 官方源码 checkout | `E:\Development\Code\nodejs\deepseek-harness`（tag dsh-v0.1.5-alpha.2——研究宿主 API 用，git grep 快） |

---

## 9. 最后叮嘱

1. **角色纪律**（主人反复强调）：执行会话自报、主人确认——**任何会话不代劳别人的角色动作**；建设/保障会话（如本会话）不触发业务机制。
2. **一切知识进结构**：工作必须有看板痕迹与知识库痕迹；无痕迹的工作等于没做。
3. **验收语义**：自报 ≠ 完成；只有主人确认才落定并沉淀「已验证结果」。
4. 机制优先于人工：发现流程缺口先修机制（像本套件一路的做法），不要用手工搬状态顶替机制。

---

> **路径变更提示（2026-09-11 补记）**：本文档 §2.1/§8 中的套件根 E:\Development\Code\nodejs\digital-twin、家目录 C:\Users\lome\...、官方 checkout E:\Development\Code\nodejs\deepseek-harness 三处路径**已失效**（实测不存在）。现址见 rchitect-knowledge/reference/dsh-suite-architecture-map.md（2026-09-11 漂移回写，待主人确认）。本文档其余内容作为交接时点快照保留，不回改。