# omp-redact · 模型厂商边界双向脱敏扩展

omp 扩展：发往 LLM 的请求（全部 messages + system + 工具描述）在厂商边界整体掩码——
敏感值（手机号/身份证/银行卡/密钥凭据/邮箱 + 自定义规则）替换为一致性占位符 `[[CODE_N]]`；
LLM 工具调用参数中的占位符在工具执行前自动还原为真实值。厂商收不到真实数据，
agent 的工具执行与本机会话持久化全程无感。

设计来源：需求包/技术方案/走查记录见仓库 `docs/designs/2026-09-18-omp脱敏扩展-*.md`；
架构移植自 dsh-redact 插件（dsh llm/stream 挂点 → omp before_provider_request / tool_call 挂点）。

## 机制

```
agent 上下文 ──→ [before_provider_request] 深遍历掩码 ──→ LLM（只见占位符）
工具执行（真实值）←── [tool_call] {input: 占位符还原} ←── 工具调用（占位符形态）
       └─→ 工具结果进上下文 → 下一轮请求再次掩码（闭环）
```

- 一致性假名：同会话同真实值 → 同占位符（首现编号），模型跨轮次理解数据关系；
- 持久化：`$HOME/.omp/redact/state.json`（0600 原子写；7 天不活跃/总量 200 清理）；
- 已知边界：助手文本流中的占位符在本机 UI/历史保持原样（omp 无流拦截点，安全方向退化）；
  不防本机 agent（同权限，映射表可读——内容级遮蔽提升成本，不构成机密性边界）。

## 配置（可选，`$HOME/.omp/redact/config.json`，样例见 config.example.json）

```json
{ "enabled": true, "restore": true,
  "categories": { "secret": true, "id": true, "bank": true, "phone": true, "email": true },
  "customRules": [ { "name": "orderID", "pattern": "ORD-[0-9]{8}" } ],
  "aliases": [ { "term": "原词", "replacement": "替换词" } ] }
```

缺省（无文件）= 全内置启用 + 还原开。

## 调试

`OMP_REDACT_DEBUG=1`：每次掩码/还原追加 `$HOME/.omp/redact/debug.log`
（`MASK session=… {类别: N}` / `RESTORE session=… tool=…`）。

## 开发

```bash
npm test   # node --test tests/（32 用例）
```

部署：将 `omp-redact-extension.js` 拷至 omp 技能扩展目录
（容器：`docker/omp/agent/extensions/`；omo：vendor + install.sh，见走查记录 §5）。
