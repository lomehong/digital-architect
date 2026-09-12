---
title: 观测平台自举经验（observatory 从零到常驻）
domain: dsh-ecosystem
source:
  origin: observatory 一期/二期实施会话（2026-09-12）
  ref: observatory/README.md + docs/design/observatory-architecture-design.md
confirmed: 2026-09-12
status: 已确认
owner: 主人
---

# 观测平台自举经验

## 可复用的技术决策

| 决策 | 做法 | 收益 |
|---|---|---|
| **零 npm 依赖平台服务** | 只用 `node:http` / `node:fs` / `node:path` / `node:sqlite` 内置模块 | 无供应链、无构建、`node server.mjs` 即跑；升级宿主 Node 即升级能力 |
| **只读摄取宿主运行时库** | `new DatabaseSync(agent.db, { readOnly: true })` 读 omp 的 `model_perf`/`model_usage` | 零侵入拿到真实用量与性能数据（不写、不影响宿主） |
| **事件流按实例分文件** | `obs/events/<instanceId>/<date>.ndjson` | 多实例并发写无竞争；NDJSON 容忍尾残行；追加即审计 |
| **文件承载请求/应答**（审批代办） | `approvals/pending/<id>.json` → `decisions/<id>.json` | 跨进程/跨用户可传递；实例崩溃不丢请求；超时自动 deny 可持久 |
| **治理不旁路** | 任务治理调 `task-ledger.mjs` CLI；知识升级只改 status 字段 | 既有不变量（状态机/来源必填/留痕）继续强制，平台只是界面 |
| **计划任务常驻 + pid 登记** | `Register-ScheduledTask` + `server.pid`（启动写、信号/退出删） | 脱离开发会话生命周期；精确启停面 |
| **告警抑制窗口** | 进程内 `alertState[id].lastFiredAt` + cooldown（默认 10 分钟） | 同一问题不刷屏；抑制状态仍呈现（可观测不隐藏） |

## 踩过的坑（均已修复并验证）

| 坑 | 现象 | 根因与修复 |
|---|---|---|
| **ESM 里用 `require`** | 配置静默加载失败（rules=0），try/catch 吞掉 `ReferenceError` | ESM 模块无 `require`；改用顶部 `import { readFileSync }`。**教训**：`catch {}` 空吞会让配置错误变成「能力静默缺失」 |
| **`const` TDZ 顺序** | 同上，IIFE 在依赖的 const 之前执行 | 被依赖的常量/函数先定义；IIFE 依赖项必须在其上方 |
| **对象字面量重复键** | `{ Date, Date: {parse} }` 后者覆盖前者 → `Date.now()` undefined → 规则全部静默失败 | 重复键在 JS 合法但语义是覆盖；**教训**：注入求值上下文时逐键核对 |
| **规则求值静默失败** | 告警不触发且无任何提示 | 修复为 fail-loud：求值异常以 warning 告警呈现（`ruleError: true`），不隐藏 |
| **极简 YAML 解析边界** | `  - id: xxx`（列表项与首键同行）不被识别 | 解析器需同时支持 `- ` 裸起始与 `- key: value` 同行起始 |
| **计划任务启动即退（0xC000013A）** | 任务 State=Ready，端口无监听 | 多为旧实例仍占端口（EADDRINUSE）+ 任务实例被杀残留；处置：按 `server.pid` 精确清理 → `Start-ScheduledTask` |
| **按进程名批量杀** | 险些杀掉自身宿主进程树 | 见 `practice/suite-build-lessons.md`：禁止 `Get-Process node \| Stop-Process`，只按 pid 登记处理 |

## 纪律沉淀

1. **空 catch 是能力静默缺失的温床**——配置/规则/契约的解析失败必须可发现（fail-loud 或显式 `error` 字段）。
2. **平台只搬事实、不做决定**——治理决定权在主人；平台的每次治理动作都留 `governance.*` 审计。
3. **数据即状态**——实例失联、事件缺失、数据源不可用都在看板显式呈现（stale/offline/error），不虚构、不隐藏。
4. **零依赖优先**——能用 Node 内置模块就不引包；供应链面越小，常驻服务越稳。
