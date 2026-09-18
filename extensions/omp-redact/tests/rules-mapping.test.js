// 规则引擎 + 映射账本测试（运行时生成金丝雀 + 结构化断言——不硬编码敏感值，
// 使测试在任意脱敏环境（含 dsh-redact 激活的维护者会话）下可读可判）
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  builtinRules,
  compileCustomRules,
  compileTermRules,
  maskText,
  createMaskMap,
  MappingStore,
  isPlaceholderShape,
  restoreAll,
  extractAliasEntries,
} from "../omp-redact-extension.js";

const ALL_ON = { secret: true, id: true, bank: true, phone: true, email: true };
const rules = () => builtinRules(ALL_ON);
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

const makePhone = () => `1${[3, 5, 7, 8, 9][Math.floor(Math.random() * 5)]}${digits(9)}`;

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
const ID_CHECK = "10X98765432";
function id18Checksum(body17) {
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += Number(body17[i]) * ID_WEIGHTS[i];
  return ID_CHECK[sum % 11];
}
function makeId18(valid) {
  const body = `110105${1949 + Math.floor(Math.random() * 50)}12${String(1 + Math.floor(Math.random() * 27)).padStart(2, "0")}${digits(3)}`;
  const good = id18Checksum(body);
  const bad = good === "X" ? "1" : "X";
  return valid ? body + good : body + bad;
}
const makeId15 = () => `11010549${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}${String(1 + Math.floor(Math.random() * 27)).padStart(2, "0")}${digits(3)}`;
function luhnOK(digitsStr) {
  let sum = 0, double = false;
  for (let i = digitsStr.length - 1; i >= 0; i--) {
    let d = Number(digitsStr[i]);
    if (Number.isNaN(d)) return false;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d; double = !double;
  }
  return sum % 10 === 0;
}
function makeBank(valid) {
  const body = `62${digits(13)}`;
  let sum = 0, dbl = true; // 全卡中末位 body 数字位于倒数第 2 位 → 被翻倍
  for (let i = body.length - 1; i >= 0; i--) { let d = Number(body[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
  const check = (10 - (sum % 10)) % 10;
  const good = body + check;
  if (valid) return good;
  const bad = body + String((check + 1) % 10);
  return luhnOK(bad) ? makeBank(false) : bad; // 拒绝 Luhn 巧合成立的「非法」卡
}
const makeEmail = () => `user${digits(6)}@example.com`;
const makeSk = () => `sk-${Array.from({ length: 32 }, () => "abcdef0123456789"[Math.floor(Math.random() * 16)]).join("")}`;
const makePem = () => ["-----BEGIN RSA PRIVATE KEY-----", digits(64), "-----END RSA PRIVATE KEY-----"].join("\n");

describe("rules · 手机号", () => {
  it("命中占位符 + 同值跨调用一致性 + round-trip", () => {
    const map = createMaskMap();
    const canary = makePhone();
    const r1 = maskText(`联系 ${canary} 确认`, rules(), map);
    assert.ok(!r1.text.includes(canary), "真实值必须被掩码");
    assert.match(r1.text, /\[\[TEL_\d+\]\]/);
    const placeholder = r1.text.match(/\[\[TEL_\d+\]\]/)[0];
    const r2 = maskText(`再次 ${canary}`, rules(), map);
    assert.equal(r2.text, `再次 ${placeholder}`);
    assert.equal(restoreAll(r1.text, map.reverse), `联系 ${canary} 确认`);
  });
  it("数字边界防截取（12 位长数字段不产生任何命中）", () => {
    const map = createMaskMap();
    const long12 = `1${digits(11)}`;
    const r = maskText(`订单号 ${long12} 不命中`, rules(), map);
    assert.equal(r.hits.length, 0);
  });
});

describe("rules · 身份证", () => {
  it("校验码合法的 18 位命中；非法不命中", () => {
    const map = createMaskMap();
    const good = makeId18(true);
    const bad = makeId18(false);
    const r = maskText(`证A ${good} 证B ${bad}`, rules(), map);
    assert.ok(!r.text.includes(good), "合法证必须被掩码");
    assert.ok(r.text.includes(bad), "非法证不掩码");
    assert.match(r.text, /\[\[ID_\d+\]\]/);
  });
  it("15 位一代证（日期段合理）命中", () => {
    const map = createMaskMap();
    const canary = makeId15();
    const r = maskText(`旧证 ${canary}`, rules(), map);
    assert.ok(!r.text.includes(canary));
    assert.match(r.text, /\[\[ID_\d+\]\]/);
  });
});

describe("rules · 银行卡（Luhn）", () => {
  it("Luhn 通过命中；失败不命中", () => {
    const map = createMaskMap();
    const good = makeBank(true);
    const bad = makeBank(false);
    const r = maskText(`卡A ${good} 卡B ${bad}`, rules(), map);
    assert.ok(!r.text.includes(good), "合法卡必须被掩码");
    assert.ok(r.text.includes(bad), "非法卡不掩码");
    assert.match(r.text, /\[\[BANK_\d+\]\]/);
  });
});

describe("rules · 密钥/凭据", () => {
  it("sk- 风格", () => {
    const map = createMaskMap();
    const canary = makeSk();
    const r = maskText(`key: ${canary}`, rules(), map);
    assert.ok(!r.text.includes(canary));
    assert.match(r.text, /\[\[SECRET_\d+\]\]/);
  });
  it("Bearer 前缀保留只脱值", () => {
    const map = createMaskMap();
    const canary = digits(20);
    const r = maskText(`Authorization: Bearer ${canary}`, rules(), map);
    assert.match(r.text, /^Authorization: Bearer \[\[SECRET_\d+\]\]$/);
  });
  it("kv 赋值保留变量名只脱值", () => {
    const map = createMaskMap();
    const canary = `pw-${digits(10)}`;
    const r = maskText(`password = ${canary}`, rules(), map);
    assert.match(r.text, /^password = \[\[SECRET_\d+\]\]$/);
  });
  it("PEM 私钥块", () => {
    const map = createMaskMap();
    const pem = makePem();
    const r = maskText(pem, rules(), map);
    assert.ok(!r.text.includes("BEGIN RSA"));
    assert.match(r.text, /\[\[SECRET_\d+\]\]/);
  });
  it("优先级：kv 密钥值形似手机号时密钥胜出（不掏洞）", () => {
    const map = createMaskMap();
    const canary = makePhone();
    const r = maskText(`password=${canary}`, rules(), map);
    assert.match(r.text, /\[\[SECRET_\d+\]\]/);
    assert.ok(!r.text.includes("[[TEL_"));
  });
});

describe("rules · 幂等与占位符形态", () => {
  it("掩码输出重掩不变、零新命中", () => {
    const map = createMaskMap();
    const phone = makePhone(), email = makeEmail();
    const once = maskText(`邮箱 ${email} 与手机 ${phone}`, rules(), map);
    assert.ok(once.hits.length >= 2);
    const twice = maskText(once.text, rules(), map);
    assert.equal(twice.text, once.text);
    assert.equal(twice.hits.length, 0);
  });
  it("isPlaceholderShape（运行时生成的占位符形态成立）", () => {
    const map = createMaskMap();
    const p = maskText(makePhone(), rules(), map).text;
    assert.ok(isPlaceholderShape(p));
    assert.ok(!isPlaceholderShape(p.toLowerCase()));
    assert.ok(!isPlaceholderShape("[[TOOLONGCODENAMEISBEYONDLIMIT_1]]"));
  });
});

describe("rules · 自定义规则", () => {
  it("名称转类别码（orderID → ORDERID）", () => {
    const map = createMaskMap();
    const { rules: custom, errors } = compileCustomRules([{ name: "orderID", pattern: "ORD-[0-9]{8}" }]);
    assert.equal(errors.length, 0);
    const canary = `ORD-${digits(8)}`;
    const r = maskText(`订单 ${canary}`, [...rules(), ...custom], map);
    assert.ok(!r.text.includes(canary));
    assert.match(r.text, /\[\[ORDERID_\d+\]\]/);
  });
  it("非法正则跳过并报错", () => {
    const { rules: custom, errors } = compileCustomRules([{ name: "bad", pattern: "([unclosed" }]);
    assert.equal(custom.length, 0);
    assert.equal(errors.length, 1);
  });
});

describe("rules · 实体别名", () => {
  it("替换 + 长词优先 + reverse 供还原", () => {
    const map = createMaskMap();
    const { rules: alias } = compileTermRules([
      { term: "腾讯", replacement: "某公司" },
      { term: "腾讯云", replacement: "某云厂" },
    ]);
    const r = maskText("腾讯云与腾讯", [...rules(), ...alias], map);
    assert.equal(r.text, "某云厂与某公司");
    const restored = restoreAll(r.text, map.reverse, extractAliasEntries(map.reverse));
    assert.equal(restored, "腾讯云与腾讯");
  });
  it("占位符形态的别名条目被拒", () => {
    const placeholderForm = "[[" + "TEL" + "_1" + "]]"; // 运行时构造，规避写入路径上的形态转换
    assert.ok(isPlaceholderShape(placeholderForm));
    const { rules: alias, errors } = compileTermRules([{ term: placeholderForm, replacement: "x" }]);
    assert.equal(alias.length, 0);
    assert.equal(errors.length, 1);
  });
});

describe("MappingStore · 分账/持久化/清理", () => {
  it("会话分账：同值不同会话各自首现编号", () => {
    const store = new MappingStore();
    const now = Date.now();
    const canary = makePhone();
    const a = maskText(canary, rules(), store.sessionMap("a", now));
    const b = maskText(canary, rules(), store.sessionMap("b", now));
    assert.match(a.text, /\[\[TEL_1\]\]/);
    assert.match(b.text, /\[\[TEL_1\]\]/);
  });
  it("持久化 round-trip：旧占位符还原 + 新值续号", () => {
    const store = new MappingStore();
    const now = Date.now();
    const p1 = makePhone(), p2 = makePhone();
    const m1 = maskText(`${p1} 和 ${p2}`, rules(), store.sessionMap("s", now));
    const saved = store.toPersistable();
    const store2 = new MappingStore();
    store2.loadPersistable(saved, now);
    const map2 = store2.sessionMap("s", now);
    assert.equal(restoreAll(m1.text, map2.reverse), `${p1} 和 ${p2}`);
    const r = maskText(makePhone(), rules(), map2);
    const next = (map2.counters.get("TEL") ?? 0);
    assert.ok(r.text.includes(`[[TEL_${next}]]`), `新值应续号 ${next}`);
  });
  it("清理：TTL 过期 + 总量上限淘汰最旧", () => {
    const store = new MappingStore();
    const base = Date.now();
    store.sessionMap("old", base - 8 * 24 * 3600_000);
    store.sessionMap("fresh", base);
    store.prune(base);
    assert.equal(store.sessionCount(), 1);
    for (let i = 0; i < 250; i++) store.sessionMap(`s${i}`, base + i);
    store.prune(base + 300);
    assert.ok(store.sessionCount() <= 200);
  });
});
