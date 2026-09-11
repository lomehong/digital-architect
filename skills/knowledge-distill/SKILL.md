---
name: knowledge-distill
description: 架构师知识库蒸馏：把公众号文章、历史技术方案、系统串讲、复盘文档蒸馏为 architect-knowledge/ 五类结构条目（含图示解读与台账登记）。触发词：蒸馏、入库、知识采集、文章蒸馏、复盘蒸馏、business-knowledge、knowledge-distill。
---

# knowledge-distill · 知识蒸馏入库
> **路径基准**：本文出现的 architect-knowledge/、docs/designs/、templates/ 等仓库相对路径，均相对**大脑仓根**解析；大脑仓挂载点按适配文件解析（dsh=本仓库根；omp=/opt/architect，其中 architect-knowledge 与 docs 可写，其余只读）。



> 方法论：《架构师 Agent 系统化落地》§5.3——蒸馏是「把架构师大脑挖出来」的第一抓手；固定结构 = 知识覆盖约束。
> 本 SKILL 只做知识工程，**不启动设计/评审流程**（那是 architect-* 三技能的事）。

## 输入源（任一）


公众号文章 URL、历史技术方案、系统串讲文档、事故/大促复盘、Wiki 长文。**新文章采集必须走浏览器桥（微信反爬红线，服务端直抓撞验证墙，不得绕行）**；本地文档直接 read。

## 流程（八步）


1. **探测桥**（仅外部文章需要）：请求 `http://127.0.0.1:3088/ext/bridge-config`，`wsUrl` 在位才继续；不在位 → **停止并告知主人，不换非浏览器手段重试**；
2. **采集**：浏览器桥打开文章 → 文本快照取正文（标题/作者/发布时间/正文/代码块）；或 read 本地文档；
3. **图示解读**：正文图示逐张解读（本地图片用 read_image），图存 `architect-knowledge/<领域>/evidence/images/` + `image-manifest.json`（文件名/来源 URL/解读要点）；条目内注明「图 N 多模态解读」；**领域内无图示则不建 evidence 目录**；
4. **领域判定**：新领域 → 建五类目录（meta/principle/scenario/practice/reference）；既有领域 → 按主题定位落点（方法论→principle；事故/复盘→practice；外部契约→reference 引用不复制；概念/边界→meta；场景映射→scenario）；
5. **落库**：按 `architect-knowledge/README.md` 条目格式写 markdown——frontmatter 六字段（title/domain/source.origin+ref/confirmed/status/owner）必填；**新蒸馏条目一律 `status: 待审核`，未经主人确认不得静默升级为事实**；材料不足处登记「未知/待验证」，不编造；
6. **台账登记**：`source-manifest.yaml` 增/更新来源（used_by 反向索引）+ `review-queue.yaml` 增待审核行 + 对应目录 `index.md` 增行（三处缺一不可；台账是索引，frontmatter 是唯一权威）；
7. **提交**：git 中文提交（备注注明来源与条目数）；
8. **升级**：主人确认后，条目 status → 已确认、更新 confirmed 日期、review-queue 移除对应行。

## 降级与停止纪律


- 桥不可达 / 撞验证墙 → 如实记录并停止，**不绕行**；
- 来源不可回源（无 URL/路径）→ 不落库，登记未知问主人；
- 台账与 frontmatter 冲突时 → 以 frontmatter 为准修台账。

## 产出自查（每次蒸馏后）


- [ ] 条目 frontmatter 六字段齐、status: 待审核；
- [ ] 三台账同步（source-manifest / review-queue / index）；
- [ ] 图示已解读或有「不建 evidence」理由；
- [ ] git 中文提交完成；
- [ ] 待主人确认清单已呈报。
