import fs from "node:fs";
import * as mod from "./omp-redact-extension.js";

const out = [];
const rules = mod.builtinRules({ secret: true, id: true, bank: true, phone: true, email: true });
const digits = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const makePhone = () => `1${[3, 5, 7, 8, 9][Math.floor(Math.random() * 5)]}${digits(9)}`;

// A. 别名占位符形态拒绝
const a = mod.compileTermRules([{ term: "13812345678", replacement: "x" }]);
out.push(`A.alias.rules=${a.rules.length} errors=${JSON.stringify(a.errors)}`);

// B/C. restore 场景
const store = new mod.MappingStore();
const now = Date.now();
const canary = makePhone();
const masked = mod.maskText(`手机号 ${canary}`, rules, store.sessionMap("s", now));
const placeholder = (masked.text.match(/\[\[TEL_\d+\]\]/) || [])[0];
out.push(`B.masked.text.len=${masked.text.length} placeholder=${placeholder} forwardHas=${store.sessionMap("s", now).forward.has(canary)}`);
const input = { command: `echo "call ${placeholder} now"`, nested: { note: placeholder } };
const rr = mod.restoreDeep(input, store.sessionMap("s", now).reverse, []);
out.push(`B.restore.changed=${rr.changed} cmdOK=${rr.value.command === `echo "call ${canary} now"`} nestedOK=${rr.value.nested.note === canary}`);

// 别名还原
const mapA = store.sessionMap("alias", now);
mod.maskText("腾讯云与腾讯", [...rules, ...mod.compileTermRules([
  { term: "腾讯云", replacement: "某云厂" },
  { term: "腾讯", replacement: "某公司" },
]).rules], mapA);
const aliasEntries = mod.extractAliasEntries(mapA.reverse);
const rr2 = mod.restoreDeep({ command: "echo 某云厂与某公司" }, mapA.reverse, aliasEntries);
out.push(`C.alias.changed=${rr2.changed} cmd=${JSON.stringify(rr2.value.command)} entries=${JSON.stringify(aliasEntries)}`);

// D. state round-trip
const dir = fs.mkdtempSync("redact-diag-");
const p = mod.stateFilePath(dir);
const store2 = new mod.MappingStore();
const mapS = store2.sessionMap("s1", Date.now());
const canary2 = makePhone();
mod.maskText(canary2, rules, mapS);
mod.saveStateSync(p, { version: 1, maps: store2.toPersistable() });
const loaded = mod.loadStateSync(p);
out.push(`D.loaded=${loaded !== undefined} version=${loaded?.version} sessions=${Object.keys(loaded?.maps?.sessions ?? {}).length}`);
const leftovers = fs.readdirSync(path2dirname(p)).filter((f) => f.includes(".tmp-"));
out.push(`D.tmpLeftovers=${leftovers.length}`);
function path2dirname(p) { return p.replace(/[\\/][^\\/]+$/, ""); }

fs.writeFileSync("diag2-out.txt", out.join("\n") + "\n");
