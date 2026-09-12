---
title: 数字分身套件建设历程教训（2026-08~09）
domain: dsh-ecosystem
source:
  origin: digital-architect/docs/HANDOFF.md + digital-twin/docs/suite-charter.md
  ref: HANDOFF §2.2/§2.3/§7；宪章 §5 违规登记册
confirmed: 2026-09-09
status: 已确认
owner: 主人
---

# 数字分身套件建设历程教训

> 兼容原因/事故教训类条目。做 dsh 生态方案时，这些历史原因解释「为什么现在是这个样子」，改动前先对照。

## 事故教训（宪章 §5 登记，整改后销账）

1. **账本执行闸自锁事故（2026-09-05）**：F-01 修复让闸首次真实运行后，「未知名兜底 L2」策略把 read/pwsh/grep 等日常工具全数拦截，分身瘫痪。根因：**闸机制与闸策略从未一起核对过真实工具面——机制长期失效掩盖了策略缺陷**。根治：闸改 opt-in（只裁决显式声明 actionType 的调用）+ 常备健康探针。
   → **教训：修复一个失效的安全机制前，必须先审计它在真实环境下会拦截什么。**
2. **同源加固自锁（§5-07）**：加固包装器命名 `register` 且内部调自身，首条路由注册即无限递归被上层吞掉，`/dsh-memory/*` 整体 404，而分身对话走服务面无感。
   → **教训：加固类改动必须在真实服务上冒烟整张路由表。**
3. **无账本 L2 降级曾为放行**：违反「降级不扩权」。修订为**拦截 + 尽力通知**。
   → **教训：治理增强缺席时，降级必须收敛到保守侧。**

## 工程兼容原因（为什么有这些约定）

| 现象 | 历史原因 | 因此的约定 |
|---|---|---|
| 宿主包（schemastery 等）一律写 dependencies | 桌面版自愈重装 profile 依赖时 **peer 物化不稳定** | 新插件 package.json 直接声明 dependencies，勿依赖 peer |
| persona 用 config.prefix 非 config.text | alpha.2 **persona schema 收紧**（text 废弃） | 升级前读 release notes，盯 slots/panel/persona 变更；PRESET_VERSION 10 |
| 客户端面板双写（旧 slot + main/panellist） | alpha.2 起 `conversation` slot 迁移为 `main` 的 conversation key | 特性检测双写，宿主升级自动点亮 |
| 公众号采集必须走浏览器桥 | 微信反爬，服务端直抓撞验证墙 | 外部采集用真实浏览器会话指纹（Lum1104/dsh-browser） |
| 看板接管语义（task_claim 接管+审计） | 会话压缩后 session id 变化 | 任务绑定不依赖固定 session id |
| task_delegate 关键词地板 v2 | v1 把「删除几行 DEBUG 打印」误伤成 L3 致任务永不执行 | 提级规则只对明确对外/破坏性词；规则变更要回归真实案例 |
| link: 安装的源仓，迁移/重克隆后必须重建构建产物 | lib/ dist/ 被 .gitignore 忽略，全新 clone 天然缺失；宿主启动 import 即 ERR_MODULE_NOT_FOUND（dsh-architect 迁仓实测 2026-09-11：迁移后未 build，重启加载失败） | link: 源仓在迁移/重克隆后跑一遍 `npm run build`；宿主日志见 `plugin tree failed to load` 优先查此因 |
| 改包 JSON 禁用 PS ConvertTo-Json；发布资产必须结构校验 | ConvertTo-Json 对 exports 字典序列化出 `"0":{}` 伪键，子路径键与条件键混合即 ERR_INVALID_PACKAGE_CONFIG——且是**启动期致命**（服务提前退出，dsh-architect v0.3.0 首传资产实测 2026-09-11） | 改 package.json 一律用 Node 脚本（JSON.parse/stringify）；发布资产上传前跑结构校验（Node require 断言 exports 键形态）；profile 实况健康 ≠ release 资产健康，两者分别验证 |
| 进程管理禁止按进程名批量杀 | `Get-Process node \| Stop-Process` 无差别杀掉系统所有 node 进程——含自身宿主进程树与无关工作（observatory 调试实测 2026-09-12，险些自杀） | 启动时把 pid 写入登记文件（如 server.pid），停止/重启只杀登记的 pid；批量操作前先枚举目标并核对 commandline |

## 流程经验

- **验收语义**：自报 ≠ 完成——task_report 后进「待确认」，主人确认才落定；self-confirm 防线（无人执行会话不能确认自己的自报）。
- **六角色团队评审**（安全/并发/架构/测试/SRE/主人体验）一批修出 18 项——机制建设后应做多角色评审再上线。
- **「看板是大脑，twin 只是报告者」**：活动聚合不做在 twin，看板 tick 维护活动视图缓存（同步读、零网络等待）。
- **发布走 tag 触发 CI，不走手工打包**（dsh-architect v0.3.1 实测 2026-09-11）：`git tag v*` → CI 构建+测试+结构门禁（exports 键形态/无本地路径依赖/入口存在性）+ 双 tarball 挂 Release（`releases/latest/download/<name>-latest.tgz?release=<tag>` 稳定 URL = 更新路径）。手工打包的三个坑全部由门禁固化拦截：exports 伪键、file: 依赖入包、exports 死条目（外壳化迁移残留）。file: 依赖跨仓：CI 用 BRAIN_PAT secret clone 大脑总仓到兄弟路径 + npm ci 后物化产物进 node_modules（npm 11 的 ci 对 file: 快照不可靠、不跑 prepare）。
