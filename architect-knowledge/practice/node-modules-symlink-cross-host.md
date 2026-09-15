---
title: 跨宿主 node_modules 软链在容器内悬空（Windows 绝对路径 junction）
domain: dsh-ecosystem
source:
  origin: 容器侧两实例实测（oh-my-ops 仓的 @ops-pi/core、dsh-architect 的 architect-core）
  ref: 两处依赖链接解析实测（readlink -f）+ KB-R7-LEGACY 裁定记录
confirmed: 2026-09-14
status: 已确认
owner: 主人
---

# 跨宿主 node_modules 软链悬空

> **适用范围**：Windows 开发机与 Linux 容器/WSL **共享同一工作树（挂载）**时的依赖链接。**核对路径：以容器内 `readlink -f <link>` 实测为准**。

## 现象

工作树在 Windows 侧装依赖时，包管理器会把 workspace 依赖落成**指向 Windows 盘符绝对路径**的 junction/符号链接（Linux 侧呈现为宿主机挂载点下的路径，`readlink` 会直接打印出该盘符式目标）。同一工作树在 Linux 容器内挂载后：

- 链接目标**不可解析**：`readlink -f` 为空，运行时报 `Cannot find package '<name>'` 或 `ENOENT`；
- **症状具误导性**：报错点名的是“包没装”，实际是链接悬空——排查方向容易跑偏。

两个已实证实例：

| 实例 | 表现 | 处置 |
|---|---|---|
| oh-my-ops 仓的 `@ops-pi/core` | 容器内链接悬空 → 全量测试红 | 工作树**可写** → 重跑 `npm install` 重建链接，即恢复 |
| dsh-architect 的 `architect-core` | 校验脚本报 `ERR_MODULE_NOT_FOUND` | 挂载**只读** → 容器内无法重建 → 由产物侧物化真实拷贝 |

## 两类修复路径（按写权限分流）

- **工作树可写**：重跑包管理器安装（`npm install` / `bun install`）——链接按当前宿主重新生成，最小代价、首选。
- **挂载只读**：容器侧**无法**自建 node_modules；只能由产物/镜像侧把依赖**物化为真实目录拷贝**（弃 junction），或让该包以真实目录形式随镜像分发。ro 挂载下任何“容器内修链接”的方案都不成立。

## 预防

1. **依赖链接不跨宿主共享**：同一份 node_modules 不在 Windows/Linux 之间复用，各自安装；
2. CI/容器构建流程**显式执行一次安装**，不依赖宿主残留的 node_modules；
3. 加一条前置断言：构建/启动前 `readlink -f <link>` 校验，悬空即 fail-fast——比“报包名找不到”可诊断得多。

## 判定口诀与影响面

报错落在**依赖解析层**（找不到包/模块）时，**先 `readlink -f` 查链接真身，再怀疑依赖缺失**。该类问题会伪装成三类症状：包缺失、模块解析错误、测试“环境性失败”（最易被误判为环境噪音而放行）。
