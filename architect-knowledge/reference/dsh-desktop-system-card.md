---
title: System Card：dsh-desktop（桌面宿主，官方 checkout deepseek-harness @ dsh-v0.1.5-alpha.2）
domain: dsh-ecosystem
source:
  origin: github.com/deepseek-ai/deepseek-harness（官方源码，tag dsh-v0.1.5-alpha.2，commit b2e3b2a）
  ref: 仓库结构实测 + HANDOFF §2.1/§2.3（2026-09-09 生成）
confirmed: 2026-09-11
status: 待审核
owner: 主人
---

# System Card：dsh-desktop（桌面宿主）

> service-knowledge 首张 System Card（阶段 4）。**当前行为以代码为准**——本卡是 2026-09-09 快照，
> 官方迭代快，升级前按 release notes 核对并更新本卡（confirmed 日期必须刷新）。

## 定位与职责

DeepSeek Harness 的桌面发行版（Tauri 应用）：**一个 dsh 实例 = 一个数字分身**的宿主容器。
装载 agent 预设、提供 web 会话 GUI（固定端口 3088）、承载全部 Cordis 插件（bundle 方式）。

## 结构（apps / packages 实测）

| 部分 | 内容 |
|---|---|
| `apps/desktop` + `apps/desktop-host` | Tauri 桌面壳与宿主进程（dsh-desktop 应用本体） |
| `apps/web` | web GUI（Vite 入口；`window.__DSH_BOOT__` 注入——该入口**不是**独立应用） |
| `apps/cli` | 命令行面 |
| `packages/*`（50+） | core/host/session/llm/tools 面（fs/pwsh/grep/glob）、skill、goal/todo/jobs、sandbox、subagent、typert（网关）、web、preset、bundle、storage、workspace… |

## 运行特征

- web 端口**固定 3088**（本机改动的固定端口功能）；HTTP 基址 `http://127.0.0.1:3088`，web 会话 cookie 认证，首引 token 在 `dsh-desktop.log` 尾部 `dsh web:` 行。
- 家目录 `DSH_HOME`：**设备特定，不入库**（dsh-desktop 形如 `<AppData>\dsh-desktop-app-data\home`，以会话实际环境为准）；插件数据各归 `$DSH_HOME/<插件id>/`。
- web profile：`$DSH_HOME\profiles\web\package.json`（dsh.profile.bundles 列全部 bundle；套件插件经 junction/link 指向源码仓）。
- **桌面版自愈**：升级/重装 profile 依赖自动完成——但 peer 物化不稳定，宿主包导入必须落 dependencies（套件已根治）。
- 客户端面板 API：alpha.2 起 `conversation` slot 迁移为 `main` 的 conversation key（宿主升级自动点亮双写面板）。

## 变更约束

- 本 checkout 是**官方只读参考**（研究宿主 API 用，git grep 快）：不在 checkout 上做本地修改；
- persona schema 已收紧（config.text 废弃 → 必须 prefix，PRESET_VERSION 10）；
- 升级前必读 release notes，重点盯 **slots / panel / persona / preset 行** 变更（套件 §7 风险条）；
- 跨版本兼容靠套件侧特性检测双写，不改宿主。

## 测试与验证入口

- 官方仓自带测试面（packages/* 各自 vitest）；套件侧验证 = 各插件仓测试全绿 + 桌面版真实会话冒烟；
- 宿主 HTTP 健康探测：`GET http://127.0.0.1:3088/ext/bridge-config` → `{"wsUrl":"ws://127.0.0.1:3088/ext/bridge"}`。

## 发布与回滚

- 官方发布走 GitHub tag（如 dsh-v0.1.5-alpha.2）；桌面版自升级；
- 回滚 = 桌面版回退版本 + profile 重物化（依赖 junction 指向套件源码仓，套件侧不受影响）。

## 与套件的关系

宿主消费（允许且不计耦合）：agentPresets / sessions / webServer / typertGateway / tools / slots / settings 等
全部 `@deepseek-ai/dsh-*` 服务。套件插件只面向宿主服务编程（联邦原则一：宿主是平台，不是邻居）。
