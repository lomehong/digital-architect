---
title: 观测平台自举经验（observatory 从零到常驻）
domain: dsh-ecosystem
source:
  origin: observatory 一期/二期实施会话（2026-09-12）
  ref: observatory/README.md + docs/design/observatory-architecture-design.md
confirmed: 2026-09-12
updated: 2026-09-12
status: 已确认
owner: 主人
---

> 更新说明（2026-09-12）：追加坑表 3 条（负测误写生产数据 / 平台代填操作者 / HTTP 摄入混批漏收 / PID 登记归属）与纪律 5–7（写操作测试隔离、不替主人署名、留痕更正）。
> 本文其余部分（含三期实施结论）已随 observatory 三期完成而生效；**新增条目待主人复核**。


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
| **负测误写生产数据**（严重） | 治理端点负测中对**真实台账**执行 confirm，**两次**改变了生产任务状态（均已回滚并追加留痕） | 根因：测试只关心「端点通不通」，没区分「拒绝路径」与「写路径」。修复：①合法写路径测试一律指向 `test-fixtures/fake-ledger`（不落盘夹具）；②服务端对地址簿登记的真实台账要求显式 `confirmReal=true`，脚本/自动化默认被拦（实测 400） |
| **平台代填操作者**（严重） | 服务端 `by \|\| '主人'`、前端硬编码 `by: '主人'`——任何本地调用都能以主人名义落定任务 | 根因：把「界面是给主人用的」等同于「操作者就是主人」。修复：`by` 必填且**不代填**（服务端路由层 + 函数层双防线），前端显式声明「以谁的名义」，审批亦先问操作者 |
| **HTTP 摄入混批漏收** | 一个坏事件混在合法批次里会被**接受**（`problems.length === valid.length` 在混合批次下恒真） | 逐事件用局部判定数组，不用跨事件累加计数；负测 `accepted=1/rejected=2` 覆盖此回归 |
| **PID 登记归属脚本目录** | 临时数据根起第二实例会覆盖主实例的 pid 登记，停机会杀错 | pid 属**运行期状态**应归数据根：`<data>/server.pid`；多实例并存互不覆盖 |

## 纪律沉淀

1. **空 catch 是能力静默缺失的温床**——配置/规则/契约的解析失败必须可发现（fail-loud 或显式 `error` 字段）。
2. **平台只搬事实、不做决定**——治理决定权在主人；平台的每次治理动作都留 `governance.*` 审计。
3. **数据即状态**——实例失联、事件缺失、数据源不可用都在看板显式呈现（stale/offline/error），不虚构、不隐藏。
4. **零依赖优先**——能用 Node 内置模块就不引包；供应链面越小，常驻服务越稳。
5. **写操作的测试必须与生产隔离**（血泪）——拒绝路径可在生产端点测；任何**可能成功**的调用只能指向隔离夹具。发请求前先问：「这个请求如果成功，会改到什么？」
6. **不要替主人署名**——平台记录的操作者必须是真实发起者；一个 `|| '主人'` 默认值本身就是权限漏洞。本地无认证服务须以「显式声明 + 真实台账二次声明」补偿。
7. **误操作留痕更正，而非抹除**——追加 `rollback` 事件说明起因与恢复动作，审计链才可复盘；悄悄改回等于掩盖。
