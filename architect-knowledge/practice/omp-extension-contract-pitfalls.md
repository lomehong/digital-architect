---
title: oh-my-pi 扩展契约实测坑位（审批/审计/提示/装载）
domain: dsh-ecosystem
source:
  origin: oh-my-pi 实装源码（npm 分发 `@oh-my-pi/pi-coding-agent` v18.1.18）+ 本机探针实测
  ref: 仓库 github.com/can1357/oh-my-pi；包内相对路径 `packages/coding-agent/src/extensibility/extensions/{types,loader,wrapper,runner}.ts`、`src/tools/approval.ts`、`src/tools/essential-tools.ts`、`src/session/exit-diagnostics.ts`；实测记录见目标项目 `docs/reports/probes/v41-fix-verification-probe.ts`
confirmed: 2026-09-12
status: 已确认
owner: 主人
---

# oh-my-pi 扩展契约实测坑位

> **适用范围**：在 oh-my-pi（omp）上开发 pi 扩展时的安全与正确性约束。ops-pi 方案（`docs/design/ops-pi-architecture-design.md` v4.1）首次系统性实测得出。
> **核对路径**：当前行为以 omp 实装源码为准；升级 omp 后须按本文「复跑入口」重新验证。发现方式：`npm pack @oh-my-pi/pi-coding-agent@<版本>` 解包读 `src/` 与 `dist/types/`，并用 `omp -e <探针>.ts -p` 实跑。

## 坑 1：默认审批模式 `yolo`，且 `override` 在 yolo 下被忽略 → 安全属性静默失效

- **事实**：`approvalMode` 默认取 `?? "yolo"`（`extension wrapper`），此时 `resolveApproval` 的 yolo 分支**只读 `decision.policy`**，工具 `approval` 返回的 `{ override: true }` **不参与**判定——即「强制要求人工确认」的声明在默认配置下**等于没有**，工具会直接执行。
- **为什么危险**：把「需要人工批准」表达为 `override` 的扩展，在**未显式配置**的环境中会静默放行高危操作。这属于「静默放行」，违反套件联邦原则的显式降级三要素（安全收敛）。
- **正确做法**：
  1. **不用 `override` 承载安全属性**。需要「无人值守必须拒绝」时，用 `tool_call` 钩子做**模式无关**的兜底（`ctx.hasUI` 为假 → `{ block: true }`）——该层不受 `approvalMode` 影响；
  2. 需要「任何模式都放行/拒绝」时用 `approval` 返回 `{ policy: "allow" | "deny" }`（`policy` 在解析顺序中优先级最高，yolo 关不掉）；
  3. 扩展 API **无 settings 访问器**，**无法自检审批模式**，故不得把安全属性建立在「部署时会配好」的假设上。
- **实测**：`--approval-mode yolo` + 非交互，`override: true` 的工具直接执行；叠加模式无关兜底层后同一命令被拒且工具未运行。

## 坑 1b：`tool_call` 钩子里改写 `event.input` 会传播进审批与执行（入参可被劫持）

- **事实**：`event.input` 是**共享可变对象**，多个 `tool_call` handler 按注册顺序依次看到它，**改写向下游传播**——后续 handler、**审批门的后续求值**、以及 `execute` 收到的入参都会被影响。经实测：`approval` 在一次调用中**被求值 3 次**（首评在 hooks 之前，后两次在 hooks 之后）。
- **危害**：共载的（恶意或缺陷）扩展可把**未授权目标伪造成已授权目标**，使审批为「另一个请求」背书，而执行的是伪造后的参数。**防御不得依赖共载方善意。**
- **关键缓解机制（实测）**：审批的**首次求值看到的是模型发出的原始入参**；若首评返 `policy:"deny"`，宿主**在发出 `tool_call` 之前短路**——钩子根本不会运行。
- **正确做法**：
  1. **预授权必须以 default-deny 表达在审批层**（`approval` 返 `{policy:"allow"|"deny"}`），**不要**把放行表藏在 `execute` 里——只有审批层首评能看到原始入参；
  2. `approval` 函数**必须是纯函数**：被求值 3 次，**不得消耗一次性令牌或有任何副作用**（TOCTOU）；令牌的「用掉」放在 `execute` 复核通过之后；
  3. `execute` 首行**重算全部校验维度**（内容 + 目标 + 授权），覆盖「目标不变仅改命令内容」这一类前两层均放行的改写；
  4. 可选加固 `Object.freeze(event.input)`：实测可让后续改写的赋值抛 `TypeError`、并保证审批/执行看到原值——但会**破坏平台允许的「共载扩展就地打补丁」用法**，故仅在高隔离单扩展部署启用。
- **边界**：扩展在 `execute` 期**无法**从会话分支回溯模型原始 toolCall（分支尚未包含该 assistant 消息），故真值只能来自审批层首评。
- **建议**：向 omp 上游反馈「`tool_call` handler 改写入参的传播语义」作为平台契约问题。

## 坑 1c：`tool_execution_end.result.content[].text` 携带拒绝原因（审计可用）

- **事实**：被拒绝的调用（无论拒绝来自扩展的 `tool_call` block，还是宿主审批门）在 `tool_execution_end` 的 `result.content[0].text` 中**携带原因文本**（宿主拒绝含 `Reason:` 行）。
- **正确做法**：审计在 `tool_execution_end` 提取该文本并按原因前缀分类（如 `[ERR_PERMISSION]` / `[ERR_POLICY]`，宿主拒绝归 `host-policy`）——**无需**在 `tool_call` 内另写前置审计条目。

## 坑 2：`tool_result` 不覆盖被阻断的工具调用 → 审计漏掉「被拒绝」记录

- **事实**：当 `tool_call` 钩子返回 `{ block: true }` 时，事件序列为 `tool_call` → `tool_execution_start` → `tool_execution_end`，**不触发 `tool_result`**，且 `execute` 未运行。同理，被 `approval` 的 `policy: "deny"` 短路拒绝的调用也不会触发 `tool_call`。
- **为什么危险**：把审计钩子挂在 `tool_result` 上，会**恰好漏掉所有被拒绝的调用**——而这通常正是审计最需要的那部分。
- **正确做法**：审计挂 **`tool_execution_end`**（携带 `toolName`/`toolCallId`/`result`/`isError`，执行与被阻断**都**触发）；工具返回的 `details` 可从 `result.details` 取到（该字段确实会回流）。
- **附带事实**：平台已有原生审计条目 `tool_execution_start`（工具实现启动前写入会话、用于 resume 诊断），扩展**不必重复记录启动标记**，只补业务语义字段即可，避免双份审计。

## 坑 3：`before_agent_start` 的 `event.systemPrompt` 是 `string[]`，模板插值会损坏系统提示

- **事实**：`event.systemPrompt` 运行时为**数组**（类型声明亦为 `string[]`）；直接 `` `${event.systemPrompt}\n\n${hints}` `` 会得到逗号粘连的串，破坏原提示的分段结构。
- **正确做法**：先归一化再拼接——`const base = Array.isArray(event.systemPrompt) ? event.systemPrompt.join("\n\n") : String(event.systemPrompt)`。**返回值**可以是 `string`（平台对返回值做了 string 兼容）。

## 坑 4：扩展工具默认 `loadMode: "discoverable"` → 工具自身的审批声明不是控制门

- **事实**：装载模式默认对非内建名字返回 `discoverable`，工具因此从顶层 schema 移除、改挂 `xd://` 设备，经**外层 `write` 工具**派发。
- **后果**：最严模式（`always-ask`）下，连 `approval: "read"` 的只读扩展工具都**不可达**（报外层 `write` 需要审批）；更严重的是工具自身声明的档位/策略**根本未被咨询**——安全语义不可推理。
- **正确做法**：需要作为顶层工具使用的扩展工具**必须显式声明 `loadMode: "essential"`**，并把它写进契约测试断言（防回归误删）。

## 复跑入口（升级 omp 后逐条验证）

1. 用探针扩展注册 4 个工具：`approval:"read"`、`approval: () => ({tier:"exec", policy:"allow"})`、`policy:"deny"`、以及「需人工批准」形态；
2. 在 `--approval-mode yolo` 与 `always-ask` 两种模式下、**非交互**（`-p`）各跑一次，记录每个调用的结果与事件序列；
3. 断言：`read` 放行；`policy:"allow"` 在 yolo 下仍放行；`policy:"deny"` 在 yolo 下仍拒；「需人工批准」在非交互下被拒且 `execute` 未运行；
4. 断言：被拒调用在 `tool_execution_end` 处留下审计条目；`before_agent_start` 返回的提示无粘连。
