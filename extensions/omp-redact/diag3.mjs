import fs from "node:fs";
const s = fs.readFileSync("tests/rules-mapping.test.js", "utf8");
const lines = s.split(/\r?\n/);
const line = lines[196]; // L197
const m = line.match(/term: ("(?:[^"\\]|\\.)*")/);
const term = JSON.parse(m[1]);
const constructed = "[[" + "TEL" + "_" + "1" + "]]";
const dump = (label, str) => {
  const cps = [...str].map((c) => {
    const cp = c.codePointAt(0);
    return cp > 126 ? `<U+${cp.toString(16).toUpperCase()}>` : c;
  }).join("");
  return `${label}: len=${str.length} cps=[${cps}] regexFormTest=${/\[\[[A-Z][A-Z0-9]{0,23}_\d{1,10}\]\]/.test(str)}`;
};
fs.writeFileSync("diag3-cps.txt", [
  dump("fileTerm", term),
  dump("constructed", constructed),
  `equal=${term === constructed}`,
].join("\n") + "\n");
