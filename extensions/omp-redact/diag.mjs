import fs from "node:fs";
import * as mod from "./omp-redact-extension.js";

const rules = mod.builtinRules({ secret: true, id: true, bank: true, phone: true, email: true });
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const out = [];

// id15 场景
const id15 = "11010549" + String(1 + Math.floor(Math.random() * 27)).padStart(2, "0") + digits(3);
const map1 = mod.createMaskMap();
const r1 = mod.maskText(`旧证 ${id15}（长度 ${id15.length}）`, rules, map1);
out.push(`id15.len=${id15.length} hits=${JSON.stringify(r1.hits.map((h) => h.code))} stillPlain=${r1.text.includes(id15)}`);

// bank 场景
function makeBank(valid) {
  const body = `62${digits(13)}`;
  let sum = 0, dbl = false;
  for (let i = body.length - 1; i >= 0; i--) { let d = Number(body[i]); if (dbl) { d *= 2; if (d > 9) d -= 9; } sum += d; dbl = !dbl; }
  const check = (10 - (sum % 10)) % 10;
  const good = body + check;
  if (valid) return good;
  const bad = body + String((check + 1) % 10);
  // bad 若 Luhn 巧合成立则重生成
  let s2 = 0, d2 = false;
  for (let i = bad.length - 1; i >= 0; i--) { let d = Number(bad[i]); if (d2) { d *= 2; if (d > 9) d -= 9; } s2 += d; d2 = !d2; }
  return s2 % 10 === 0 ? makeBank(false) : bad;
}
const bankGood = makeBank(true);
const bankBad = makeBank(false);
const map2 = mod.createMaskMap();
const r2 = mod.maskText(`卡 ${bankGood}`, rules, map2);
out.push(`bank.good.hits=${JSON.stringify(r2.hits.map((h) => h.code))}`);
const map3 = mod.createMaskMap();
const r3 = mod.maskText(`卡 ${bankBad}`, rules, map3);
out.push(`bank.bad.maskedAs=${JSON.stringify(r3.hits.map((h) => h.code))} stillPlain=${r3.text.includes(bankBad)}`);

// restore 场景
const phone = `1${[3, 5, 7, 8, 9][Math.floor(Math.random() * 5)]}${digits(9)}`;
const map4 = mod.createMaskMap();
mod.maskText(`手机号 ${phone}`, rules, map4);
const alias = mod.extractAliasEntries(map4.reverse);
const rr = mod.restoreDeep({ command: `echo "call ${phone} now"`, nested: { note: phone } }, map4.reverse, alias);
out.push(`restore.changed=${rr.changed} commandOK=${rr.value.command.includes(phone)} nestedOK=${rr.value.nested.note === phone}`);

// payload 计数
const canary = phone;
const payload = {
  model: "m",
  messages: [
    { role: "user", content: `读取 ${canary}` },
    { role: "assistant", content: [{ type: "text", text: `好 ${canary}` }, { type: "tool_use", id: "t", name: "bash", input: { command: `echo ${canary}` } }] },
    { role: "toolResult", content: [{ type: "text", text: `输出 ${canary}` }] },
  ],
  tools: [{ type: "function", function: { name: "bash", description: `e ${canary}`, parameters: {} } }],
};
const map5 = mod.createMaskMap();
const r5 = mod.maskDeep(payload, rules, map5);
out.push(`payload.hits=${r5.hits.length} clean=${!JSON.stringify(r5.value).includes(canary)}`);

fs.writeFileSync("diag-out.txt", out.join("\n") + "\n");
