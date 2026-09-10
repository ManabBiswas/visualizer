// Split of effective lines: production code vs test code. Dev-only.
import { readFileSync } from "fs";
import { execSync } from "child_process";

const files = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
const src = files.filter((f) => /\.(ts|tsx|mjs|cjs|js|css|java)$/.test(f));

function count(f) {
  const text = readFileSync(f, "utf8");
  let eff = 0, inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (inBlock) { if (line.includes("*/")) inBlock = false; continue; }
    let inStr = null, isComment = false, scan = line;
    for (let i = 0; i < scan.length; i++) {
      const c = scan[i];
      if (inStr) {
        if (c === "\\") i++;
        else if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
      if (c === "/" && scan[i + 1] === "/") { isComment = true; break; }
      if (c === "/" && scan[i + 1] === "*") {
        const close = scan.indexOf("*/", i + 2);
        if (close === -1) { inBlock = true; isComment = true; break; }
        scan = scan.slice(0, i) + " " + scan.slice(close + 2);
        i--;
      }
    }
    if (isComment || !scan.trim()) continue;
    eff++;
  }
  return eff;
}

let prod = 0, test = 0;
const prodByArea = {};
for (const f of src) {
  const n = count(f);
  const isTest = /\.test\.|\/tests?\//.test(f);
  if (isTest) test += n;
  else {
    prod += n;
    const area = f.split("/")[0];
    prodByArea[area] = (prodByArea[area] ?? 0) + n;
  }
}
console.log("Production:", prod, "effective lines");
console.log("Tests:", test, "effective lines");
console.log("Ratio prod:test =", (prod / test).toFixed(1) + ":1");
console.log("\nProduction by area:");
for (const [k, v] of Object.entries(prodByArea).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${v}`);
}
