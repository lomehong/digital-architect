---
title: 外部工具引用：Archify（架构系统地图生成与校验）
domain: dsh-ecosystem
source:
  origin: https://github.com/tt-a1i/archify（omp.sh 官方 README 实读，2026-09-11）
  ref: skills/archify/PINNED.txt（仓库内 pinned commit c1443b31b496eebf4a68bf83151816c955ddb796）
confirmed: 2026-09-11
status: 已确认
owner: 主人
---

# 外部工具引用：Archify

> **引用不复制**：本文是接入索引。能力细节以官方 SKILL.md（`skills/archify/SKILL.md`）与 omp.sh 为准。

## 能力一句话

Agent 产出 typed JSON IR → Archify 确定性编译为**自包含交互式 HTML/SVG 系统地图**。五类图（Architecture/Workflow/Sequence/Data Flow/Lifecycle）；Before/Delta/After 变更对比；一切交互 grounded（不发明拓扑、不声称运行时影响）；原子校验 + 机器可读 repair receipt。支持 `meta.locale=zh-CN`。

## 与架构师 Agent 的契约（主人 2026-09-11 拍板：按需工件）

| 场景 | 用法 | 承载 |
|---|---|---|
| design 方案涉及架构表达 | 产出交互式架构图（组件/边界/主路径，可选 SRC 源码证据），落盘 `docs/designs/assets/` 并在方案「系统覆盖」区引用 | `skills/architect-design/SKILL.md` 第四步可选工件 |
| review 变更类方案 | 两份已验证快照 → Architecture Delta（Before/Delta/After）；**archify 只列 authored 事实，影响面与风险结论仍由评审证据回源产生** | `skills/architect-review/SKILL.md` 评分区可选附件 |
| 知识表达 | dsh 生态 Architecture Map 等地图按需可视化 | reference 引用，不强制 |

## 接入形态（双宿主，决策 D9/D10 精神）

| 宿主 | 形态 | 版本锚点 | 状态 |
|---|---|---|---|
| omp 容器（oh-my-pi） | `skills/archify/` skill bundle（随仓 git）+ 容器内 Node/Bun 直接跑 CLI | PINNED commit c1443b3（v2.17.0-dev.1 线） | ✅ doctor 全绿，CLI guide 实测 |
| dsh 分身（web profile） | 官方社区插件 `@tt-a1i/archify-dsh@0.1.0`（Skill-only provider，bundled Skill 2.14.0） | npm 0.1.0（适配 target：dsh 0.1.0-rc.6 开发预览，**与我们 alpha.2 跨版本无稳定保证**） | 已装入 profile；**待宿主重启生效**，兼容性以重启后加载为准 |

## 纪律

- archify 只列 authored 事实——**不推断影响、风险、合并安全**；架构判断仍是架构师（评审证据回源）的职责。
- 升级：`skills/archify/` 更新后同步 `.omp/skills/` 与 `.claude/skills/` 双根副本，并刷新 PINNED.txt。
- dsh 侧卸载（兼容性失败时）：`dsh plugin --profile web remove @tt-a1i/archify-dsh`。
