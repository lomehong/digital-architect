// 深遍历掩码/还原 + 配置加载 + 扩展工厂编排（真机探针形状夹具）
// 金丝雀运行时生成 + 结构化断言（不硬编码敏感值）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  maskDeep,
  maskText,
  restoreDeep,
  loadConfigSync,
  saveStateSync,
  loadStateSync,
  stateFilePath,
  MappingStore,
  builtinRules,
  defaultConfig,
  compileTermRules,
} from "../omp-redact-extension.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rules = () => builtinRules(defaultConfig().categories);
const makePhone = () => `1${[3, 5, 7, 8, 9][Math.floor(Math.random() * 5)]}${digits(9)}`;
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

// §1.1 实测形状夹具（容器真机探针抓取，openai-completions 族）
function probeShapePayload(canaryPhone) {
  return {
    model: "glm-5.3-flash",
    messages: [
      { role: "system", content: "你是架构师 Agent。" },
      { role: "user", content: `读取联系人的手机号 ${canaryPhone} 并回显` },
      {
        role: "assistant",
        content: [
          { type: "text", text: `好的，手机号是 ${canaryPhone}` },
          { type: "tool_use", id: "t1", name: "bash", input: { command: `echo ${canaryPhone}` } },
        ],
      },
      { role: "toolResult", content: [{ type: "text", text: `输出：${canaryPhone}` }] },
    ],
    stream: true,
    stream_options: { include_usage: true },
    tools: [
      { type: "function", function: { name: "bash", description: `执行命令，例如 echo ${canaryPhone}`, parameters: {} } },
    ],
    max_completion_tokens: 4096,
    reasoning_effort: "high",
  };
}

describe("maskDeep · 出站 payload 掩码（形状无关深遍历）", () => {
  it("实测形状夹具：content 字符串/block 数组/tools.description 全覆盖，结构保持", () => {
    const store = new MappingStore();
    const map = store.sessionMap("s", Date.now());
    const canary = makePhone();
    const payload = probeShapePayload(canary);
    const { value, changed, hits } = maskDeep(payload, rules(), map);
    assert.ok(changed);
    const text = JSON.stringify(value);
    assert.ok(!text.includes(canary), "真实值必须从出站 payload 消失");
    assert.equal(hits.length, 5); // user content / assistant text / tool_use.input / toolResult / tools.description
    assert.match(text, /\[\[TEL_1\]\]/); // 同值 → 同占位符（首现编号 1）
    assert.equal(value.model, "glm-5.3-flash");
    assert.equal(value.stream, true);
    assert.equal(value.max_completion_tokens, 4096);
    assert.equal(value.messages.length, 4);
    assert.equal(value.messages[2].content[1].name, "bash");
  });
  it("无敏感内容 → changed=false 且返回同一引用（零干预）", () => {
    const store = new MappingStore();
    const map = store.sessionMap("s", Date.now());
    const payload = { model: "glm-5.3-flash", messages: [{ role: "user", content: "你好" }] };
    const { value, changed } = maskDeep(payload, rules(), map);
    assert.equal(changed, false);
    assert.equal(value, payload);
  });
  it("幂等：掩码后 payload 重掩不再变化", () => {
    const store = new MappingStore();
    const map = store.sessionMap("s", Date.now());
    const first = maskDeep(probeShapePayload(makePhone()), rules(), map);
    const second = maskDeep(first.value, rules(), map);
    assert.equal(second.changed, false);
  });
});

describe("restoreDeep · tool_call 参数还原", () => {
  it("嵌套参数中的占位符还原为真实值", () => {
    const store = new MappingStore();
    const now = Date.now();
    const map = store.sessionMap("s", now);
    const canary = makePhone();
    const masked = maskText(`手机号 ${canary}`, rules(), map);
    const placeholder = masked.text.match(/\[\[TEL_\d+\]\]/)[0]; // LLM 回抄的占位符形态
    const input = { command: `echo "call ${placeholder} now"`, nested: { note: placeholder } };
    const { value, changed } = restoreDeep(input, map.reverse, []);
    assert.ok(changed);
    assert.equal(value.command, `echo "call ${canary} now"`);
    assert.equal(value.nested.note, canary);
  });
  it("无占位符 → changed=false（调用方 no-op）", () => {
    const store = new MappingStore();
    const map = store.sessionMap("s", Date.now());
    const input = { command: "ls -la" };
    const { value, changed } = restoreDeep(input, map.reverse, []);
    assert.equal(changed, false);
    assert.equal(value, input);
  });
  it("别名替换词还原为真实原词（长词优先）", () => {
    const store = new MappingStore();
    const now = Date.now();
    const map = store.sessionMap("s", now);
    const { rules: alias } = compileTermRules([
      { term: "腾讯云", replacement: "某云厂" },
      { term: "腾讯", replacement: "某公司" },
    ]);
    maskText("腾讯云与腾讯", [...rules(), ...alias], map);
    const aliasEntries = [];
    for (const [replacement, term] of map.reverse) {
      if (replacement === "" || term === "" || /^\[\[[A-Z]/.test(replacement)) continue;
      aliasEntries.push({ key: replacement, value: term });
    }
    aliasEntries.sort((a, b) => b.key.length - a.key.length);
    const { value, changed } = restoreDeep({ command: "echo 某云厂与某公司" }, map.reverse, aliasEntries);
    assert.ok(changed);
    assert.equal(value.command, "echo 腾讯云与腾讯");
  });
});

describe("配置加载", () => {
  it("无配置文件 → 缺省全内置启用", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-cfg-"));
    const cfg = loadConfigSync(path.join(dir, "absent.json"));
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.restore, true);
    assert.ok(cfg.rules.length > 10);
    assert.deepEqual(cfg.warnings, []);
  });
  it("类别开关生效（phone 关 → TEL 规则缺席）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-cfg-"));
    const p = path.join(dir, "config.json");
    fs.writeFileSync(p, JSON.stringify({ categories: { phone: false } }));
    const cfg = loadConfigSync(p);
    assert.ok(!cfg.rules.some((r) => r.code === "TEL"));
    assert.ok(cfg.rules.some((r) => r.code === "SECRET"));
  });
  it("非法自定义正则 → 跳过并告警", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-cfg-"));
    const p = path.join(dir, "config.json");
    fs.writeFileSync(p, JSON.stringify({ customRules: [{ name: "bad", pattern: "([bad" }] }));
    const cfg = loadConfigSync(p);
    assert.equal(cfg.warnings.length, 1);
    assert.equal(cfg.rules.filter((r) => r.code === "BAD").length, 0);
  });
  it("坏 JSON → 缺省配置", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-cfg-"));
    const p = path.join(dir, "config.json");
    fs.writeFileSync(p, "{broken");
    const cfg = loadConfigSync(p);
    assert.equal(cfg.enabled, true);
    assert.ok(cfg.rules.length > 0);
  });
});

describe("状态持久化", () => {
  it("save → load round-trip（原子写不残留 tmp）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-state-"));
    const p = stateFilePath(dir);
    const store = new MappingStore();
    const map = store.sessionMap("s1", Date.now());
    const canary = makePhone();
    maskText(canary, rules(), map);
    saveStateSync(p, { version: 1, maps: store.toPersistable() });
    const loaded = loadStateSync(p);
    assert.equal(loaded.version, 1);
    const store2 = new MappingStore();
    store2.loadPersistable(loaded.maps, Date.now());
    assert.equal(store2.sessionCount(), 1);
    const restored = restoreDeep({ v: canary }, store2.sessionMap("s1", Date.now()).reverse, []);
    assert.equal(restored.value.v, canary);
    const leftovers = fs.readdirSync(path.dirname(p)).filter((f) => f.includes(".tmp-"));
    assert.equal(leftovers.length, 0);
  });
  it("损坏状态文件 → undefined（全新状态）", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redact-state-"));
    const p = stateFilePath(dir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "{corrupt");
    assert.equal(loadStateSync(p), undefined);
  });
});

describe("扩展工厂编排（mock pi 冒烟）", () => {
  it("注册三挂点；session→mask→restore 全链走通", async () => {
    const mod = await import("../omp-redact-extension.js");
    const handlers = {};
    const pi = { on: (name, handler) => { handlers[name] = handler; } };
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "redact-home-"));
    const oldHome = process.env.HOME;
    process.env.HOME = tmpHome;
    try {
      await mod.default(pi);
      assert.ok(handlers.session_start && handlers.before_provider_request && handlers.tool_call);
      await handlers.session_start({ type: "session_start" }, { sessionManager: { sessionId: "probe-s" } });
      const canary = makePhone();
      const payload = probeShapePayload(canary);
      const replacement = await handlers.before_provider_request({ type: "before_provider_request", payload });
      assert.notEqual(replacement, undefined);
      const replacedText = JSON.stringify(replacement);
      assert.ok(!replacedText.includes(canary), "真实值不得出现在替换后 payload");
      const placeholder = replacedText.match(/\[\[TEL_\d+\]\]/)[0]; // LLM 视角的占位符
      // 入站：工具参数携带占位符 → 还原为真实值
      const result = await handlers.tool_call({
        type: "tool_call", toolName: "bash", toolCallId: "t1",
        input: { command: `echo "${placeholder}"` },
      });
      assert.deepEqual(result.input, { command: `echo "${canary}"` });
      // 无占位符 → no-op
      const noop = await handlers.tool_call({
        type: "tool_call", toolName: "bash", toolCallId: "t2",
        input: { command: "ls" },
      });
      assert.equal(noop, undefined);
    } finally {
      if (oldHome === undefined) delete process.env.HOME;
      else process.env.HOME = oldHome;
    }
  });
});
