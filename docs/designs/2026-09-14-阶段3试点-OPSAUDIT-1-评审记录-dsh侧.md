# 走查记录：阶段 3 试点 · OPSAUDIT-1 需求评审（双架构师评审委员会）——dsh 侧记录

> **权威版**：委员会汇总评审记录落**目标项目** `oh-my-ops/docs/designs/2026-09-14-阶段3试点-OPSAUDIT-1-评审记录.md`（v3.3 路径基准：工作产出落目标项目；容器无法访问大脑仓 docs/，故汇总版由容器侧落盘，commit `0355173`）。本文件 = dsh 侧评审人与流水存档，与权威版互引、不双写。

> 日期：2026-09-14 · 现场：oh-my-ops · 需求：候选 A `/ops-audit [n]` 审计回看命令
> 参与：omp-architect（容器，需求方/主评）· dsh-architect（PC-SZ-375，dsh 侧独立评审=本文作者）
> 状态：双方法评审一致通过；OPSAUDIT-1 已报请主人确认定案（confirm 归主人）

## 流水实录

1. **踩点**（容器架构师，无头会话）：扫描本仓提出 3 候选（A 审计回看 / B policy 损坏可诊断 / C 巡检判级），主人选定 A。
2. **需求准入**（容器架构师）：台账 `OPSAUDIT-1` 立项→认领→产出需求包 `docs/requirements/ops-audit-requirement-package.md`（133 行，B1–B9 目标 + E1–E12 证据），feature 分支提交 `9142a43`；准入结论"有条件通过"（T1–T5 未清不进 design）。
3. **评审请求投递失败**：首次寻址 `PC-SZ-375:architect` 等四种写法全失败——Hub 花名册取证：全 Hub 无 architect 会话在线。根因=dsh 侧 architect 会话未开。
4. **修复**：主人配置 dsh 侧御符 token；dsh 建设会话经**动态插件 `yuyi-1/pkg-4`** 注册 4 个 `yuyi_*` 工具进本会话（四连修：注册校验→defineTool→output schema→lossless JSON），`yuyi_status` 实测身份 = **dsh-architect**（owner hz0704027，Hub 已连接）。主人拍板 T1–T5 按建议默认值。
5. **重发成功**：dsh 侧 notify 注入容器会话 → 容器核对收件箱 → 评审请求重发至 `PC-SZ-375:dsh-architect`（expectReply，实时唤醒送达）。
6. **dsh 侧独立评审**：见下节结论。回信通道注记：dsh 侧 `yuyi_send` 动态工具在本轮出现调用路由异常（连续误投静态近邻工具，六次，无副作用），改经容器无头会话代转通知——**权威记录以本文件为准**。

## dsh 侧独立评审结论（评审人：dsh-architect）

**结论：通过——T1–T5 闭合记录采信后，可进入 architect-design。**

独立回源抽查（亲验，非转述容器踩点）：

| 项 | 抽查 | 结果 |
|---|---|---|
| E3 | `grep getBranch` 全仓 → 仅 `platform.ts:38/40/69/73`（启动断言+类型位）与 `test/platform.test.ts` | ✅ 零生产调用，「审计只写不读」成立 |
| E10 | `grep layer`（`packages/ops-extension/src/`） | ✅ 零命中，T5 漂移属实（A4 原文 layer 取值 `guard-content/guard-*/execute-revalidation/end`，ops-pi 需求包 L25） |
| E2/E12 | `commands.ts:80/89` 自落审计 + `ui.notify` 只读命令先例 | ✅ 逐行属实 |
| E6 | A4 判据原文回源（`docs/requirements/ops-pi-requirement-package.md:25`） | ✅ 一致 |

T1–T5：采信台账 `owner-decision` 事件（by=主人，commit `34f4c73`），五项均按建议默认值定案。容器侧请主人一手确认的处理正确——dsh 侧的口头指令当时确无落盘留痕，无冲突出处。

非阻断备注：
- **N1**：需求包 §6/B4 行内仍标「待确认 T1」——进 design 前建议补一行闭合标注（引 owner-decision/34f4c73），或按惯例以台账事件为决策权威、包文不回改；
- **N2**：实现前置——`/workspace` 缺 `node_modules/@ops-pi/core` 链接，`npm install` 恢复后再跑 `bun test`（B6/B8 验证依赖它）；
- **独立性声明**：两侧评审同处主人会话语境，互不通气按「评审完成前未交换意见」执行，如实记录于此。

## 剩余步骤

1. 容器主评汇总对齐（本文结论 + 其自检）→ 主人确认 OPSAUDIT-1 需求落定；
2. 冲突路径演练一轮（构造同 key 知识冲突 → 回源核对 → 主人裁决）；
3. 阶段 3 收口：两轮走查记录 + 本文件归档 `docs/designs/`。

## 追加：OPSAUDIT-2 技术方案评审（dsh 侧，2026-09-14）

容器架构师在 `feature/OPSAUDIT-2-design @ 3edfd0a` 产出可执行技术方案 `docs/designs/ops-audit-command-design.md`（178 行），经御驿请求 dsh 侧独立窗口评审（8 项验收准则）。结论：**通过（六维度 60/60）**。

- 亲验回源：信封形状探针 `v42-layer-audit-probe.ts:27-29`（`{type,customType,data}`）；三写入点 `hooks.ts:90-101`/`52-58`/`commands.ts:80,89` 均含 `data.ts`；平台面声明 `types/vendor-platform.d.ts:68-78,122-163`；
- **跨宿主同核双跑**：dsh 侧 `architect-core checkDesign` 独立复跑 = 60/60、五问 5/5、占位符 0，与 omp 插件自检一致（同核异宿交叉验证，试点增值发现）；
- 需求覆盖：B1–B9/D1–D7/T1–T5（owner-decision 34f4c73 + 781cef8）逐条落点，无私扩范围；
- 非阻断备注已随结论回信：U2 人工冒烟回填台账、N2 前置 npm install、architecture-map 补录 oh-my-ops（收口后知识任务）。

## 追加：OPSAUDIT-3 实现评审（dsh 侧，2026-09-14）

实现分支 `feature/OPSAUDIT-3-impl`（82ad530..da25b08，8 文件恰为申报清单）。结论：**通过**——可报请主人确认落定。

- **红线实测**：`hooks.ts` 区间 diff 为空；全 diff 无 `registerTool`/`systemPrompt` 触点；无危险命令注册；
- **代码对齐**：注册块 = §A.1 六步链路；先读后写（成功路径 notify 后才自审计，本次输出不含本次条目）；fail-soft 双路（读取异常与参数非法均 notify error + 自审计 isError:true）；
- **字段纪律**：`toAuditViews` 全字段 typeof 校验→缺失保持 undefined；`formatLine` 缺失呈 `-`、isError 以 ok/blocked 可辨（B3 零臆造）；
- **亲复跑**（容器内，非采信自述）：`bun test` 单测 **15 pass/0 fail**；`npm run typecheck` **0 错**；回归抽查 `platform.test.ts` **8 pass**；
- runtime 探针 `12-ops-audit.sh` 断言可抓信封破坏/字段丢失/报告头缺失三类回归；U2（交互冒烟人工）与 suite-map 补录已登记为未兑现项。

## 追加：OMOINSTALL-2 自包含安装器技术方案评审（dsh 侧，2026-09-14）

新需求线（真实环境 logstash-124 安装三连失败 → 主人拍板自包含路线）。方案 `docs/designs/omo-install-selfcontained-design.md`（184 行，feature/OMOINSTALL-1-req @ 0640ace）。结论：**通过（六维度 60/60，dsh 侧独立复跑一致）**。

- 亲验回源：A.3 管线与探针报告 §H3 逐步吻合（npm pack 18.1.18 → 生成 embedded-addon.js 嵌 .node → bun compile = omp-single 471MB，扩展数据面全链一致）；A.2 与 §H4 吻合（HOME 重定向、真实 `~/.omp` 零写入）；E1/E5 代码行抽查属实（install.sh 找不到 omp 即死、bootstrap `latest` basename 透传）；
- 非阻断备注三条已随结论回信：N1 引用精度（设计称「台账 owner-decision」但 OMOINSTALL-1.yaml 无该事件，持久记录在需求包 §6——建议补事件或改引用）；N2 分支账目（实际 feature/OMOINSTALL-1-req 与申报 feature/OMOINSTALL-2-design 不符）；N3 natives 证据路径在构建期依赖树内非仓内文件（持久证据=探针报告 §H3 根因行，已足够）；
- 试点增值：本评审对象为**交付面重塑型方案**（High-risk 命中），风险收敛靠 T1–T5 + 设计前探针硬门（H3/H4 双 ✅ 在设计前完成）——"探针先行、方案后置"的准入形态值得沉淀为实践条目。

## 追加：KB-R7-LEGACY 裁定（dsh 侧知识库治理，2026-09-14）

容器架构师（omp 容器，KB=v3.2 白名单挂载快照）跑 `architect_lint` 发现 11 处存量 R7 错误（ref 指向挂载快照中不存在的文件），按治理边界移交 dsh 侧裁定。

**裁定：11/11 全部为「快照上下文假阳性」，零真实断链。** 实证：18 条文件路径在完整大脑仓全部存在（含 `docs/design/observatory-architecture-design.md` 单数路径；2 个 KB 内部路径经 KB 根解析存在）、commit `fef1bc2`/`b20b4de` 与备份分支 `backup/pre-rewrite-20260911` 均在。

**根因**：R7 的 ref 解析基准随上下文漂移——dsh 侧（完整仓）ref 可解析故 0 错；容器侧 KB 挂载为白名单子集（v3.2 有意排除 `docs/`、`scripts/`、`.github/`），凡指向 KB 外大脑仓文件的 ref 全部解析失败。是 **v3.2 白名单（主人拍板）× R7 全仓根相对解析**的结构性张力，非条目缺陷。

**处置（组合）**：
1. **已确认条目零改动**——ref 正确且完整仓可回源，改写为非路径描述属降级，不做；
2. **判定备案**：容器侧 R7 基线 = 11 处已备案豁免；**新增条目仍须 R7 清零**；
3. **根修立项（dsh 侧）**：lint 隔离上下文感知——architect-core `lintKnowledgeAt` 增隔离/快照选项（KB 外 ref 降级 warning+计数备案），omp-architect 侧传参配合；未落地前容器以备案口径运行。

（容器按一级来源纪律先取证后移交、未擅改已确认条目——处置得当。）

## 追加：OMOINSTALL-3 自包含安装器实现评审（dsh 侧，2026-09-14）

实现分支 `feature/OMOINSTALL-3-impl`（6119a34..7367c8c，9 文件恰为申报清单：管线脚本/embed-pi-natives.mjs/bootstrap semver/install.sh v4 全量重写/release.yml/README/探针标注/docs）。结论：**通过**。

- **管线亲验**：sha256 pin fail-fast（"禁止带病构建"）→ bun install → embed-pi-natives.mjs（复刻上游 embed-native.ts 产物形状：asset import `with {type:"file"}` + files[].filePath，对齐 loader 契约）→ 品牌 patch → bun compile → --version 验证步；
- **安装器亲验**：bootstrap 双重 semver 门（源级跳过+终态 die，vlatest 回归闭环）；bun 锁 1.4.2 官方+npmmirror 回退；~/.omo 布局 + 启动器 HOME 重定向（唯一隔离机制）；OMO_LAUNCHER_V4 标记防误删 + 非本产品拒绝覆盖（双向防误伤）；--uninstall 保留 yuyi 凭据；
- **亲复跑**：容器内 `npm test` exit 0（181 pass/1 skip bwrap/0 fail）、typecheck 0 错、三脚本 `bash -n` 过；冒烟 7/7 有实战证据（CN 镜像回退通道真实触发）；CI release.yml 三处改动（L2 门加 audit-view/构建岗/打包含 omp-single）语义正确；
- 未兑现项登记完整：CI 实证随发布 tag、真实环境 D-1（A7，logstash-124）待主人。

## 收口：OPSAUDIT-3 落定与冲突路径立项（2026-09-14）

- 容器采信 dsh 侧实现评审结论（台账 `review-received` 事件 by=dsh-architect，commit `317dec9`）；**主人已会话确认 OPSAUDIT-3 落定**（confirm by=主人），方案 status=已执行；
- **冲突路径已立项 `OPSAUDIT-4`**（分支 `feature/OPSAUDIT-4-drill`），范围草案 `docs/designs/ops-audit-conflict-drill-scope.md`：D-1 A4 被拒调用 `/ops-audit` 回看闭环（必做）；D-2 无人值守双模式拒绝 / D-3 令牌单次消费（实弹复核或降级引用探针 05 证据）——**待主人批范围后执行**。

至此：需求包评审（OPSAUDIT-1）→ 技术方案评审（OPSAUDIT-2，dsh 侧同核双跑 60/60）→ 实现评审（OPSAUDIT-3，亲复跑全绿）三环全部闭环，双架构师经御驿协作的真实试点流程只余冲突路径一环。

## 追加：OPSAUDIT-2 技术方案评审（dsh 侧，2026-09-14）

容器架构师在 `feature/OPSAUDIT-2-design @ 3edfd0a` 产出可执行技术方案 `docs/designs/ops-audit-command-design.md`（178 行），经御驿请求 dsh 侧独立窗口评审（8 项验收准则）。结论：**通过（六维度 60/60）**。

- 亲验回源：信封形状探针 `v42-layer-audit-probe.ts:27-29`（`{type,customType,data}`）；三写入点 `hooks.ts:90-101`/`52-58`/`commands.ts:80,89` 均含 `data.ts`；平台面声明 `types/vendor-platform.d.ts:68-78,122-163`；
- **跨宿主同核双跑**：dsh 侧 `architect-core checkDesign` 独立复跑 = 60/60、五问 5/5、占位符 0，与 omp 插件自检一致（同核异宿交叉验证，试点增值发现）；
- 需求覆盖：B1–B9/D1–D7/T1–T5（owner-decision 34f4c73 + 781cef8）逐条落点，无私扩范围；
- 非阻断备注已随结论回信：U2 人工冒烟回填台账、N2 前置 npm install、architecture-map 补录 oh-my-ops（收口后知识任务）。

## 追加：lint 根修落地验证（2026-09-15，主人重建镜像并重启容器后）

- gh 2.95.0 回归 ✅
- credential.helper = env 版（直读 GH_TOKEN）✅
- lint bash 兜底路径：隔离提示行 + 11 处 R7 降 warning + exit 0 ✅
- omp-architect lint 工具路径：「（隔离上下文）」+ 备案计数 11 条 ✅
- 双路径一致 ✅
- 备案豁免撤销条件已满足 → 已通知容器执行撤除。
