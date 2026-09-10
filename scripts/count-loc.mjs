// Count effective (non-comment, non-blank) lines of source code, string-aware.
// Usage: node scripts/count-loc.mjs [glob...]  (defaults: app lib components parser/src scripts data types)
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["app", "lib", "components", "parser/src", "scripts", "data", "types"];

const CODE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".css",
  ".java",
  ".json", // data files count separately below
]);
const DATA_EXT = new Set([".json"]); // JSON has no comments; still skip blanks

let files = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const e of entries) {
    if (e === "node_modules" || e === ".next" || e === ".git" || e.startsWith(".")) continue;
    const p = join(dir, e);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p);
    else files.push(p);
  }
}
for (const r of ROOTS) walk(r);

const ext = (f) => f.slice(f.lastIndexOf(".")).toLowerCase();
files = files.filter((f) => CODE_EXT.has(ext(f)));

function countEffective(source) {
  let total = 0, comments = 0, blanks = 0, effective = 0;
  let inBlock = false; // inside /* */
  let blockDepth = 0;
  for (const raw of source.split(/\r?\n/)) {
    total++;
    const line = raw.trim();
    if (!line) { blanks++; continue; }
    if (inBlock) {
      comments++;
      // track nested block comments (rare in JS, legal in Java)
      for (let i = 0; i < line.length - 1; i++) {
        if (line[i] === "/" && line[i + 1] === "*") blockDepth++;
        if (line[i] === "*" && line[i + 1] === "/") { blockDepth--; if (blockDepth === 0) { inBlock = false; break; } }
      }
      continue;
    }
    // string-aware scan: does a comment marker appear OUTSIDE any string?
    let inStr = null; // "'", '"', '`'
    let isComment = false;
    let scan = line;
    for (let i = 0; i < scan.length; i++) {
      const c = scan[i];
      if (inStr) {
        if (c === "\\") { i++; continue; } // skip escaped char
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
      if (c === "/" && scan[i + 1] === "/") { isComment = true; break; }
      if (c === "/" && scan[i + 1] === "*") {
        // comment unless closed on same line
        const close = scan.indexOf("*/", i + 2);
        if (close === -1) { inBlock = true; blockDepth = 1; isComment = true; break; }
        // closed on same line: strip it and continue scanning the rest
        scan = scan.slice(0, i) + " " + scan.slice(close + 2);
        i--;
        continue;
      }
    }
    if (isComment) { comments++; continue; }
    // inline code before a trailing comment still counts as effective;
    // blank-after-strip lines (e.g. only a /* */ block) do not
    if (!scan.trim()) { comments++; continue; }
    effective++;
  }
  return { total, comments, blanks, effective };
}

const byExt = new Map();
let grand = { total: 0, comments: 0, blanks: 0, effective: 0 };
for (const f of files) {
  const e = ext(f);
  let r;
  if (e === ".json") {
    const src = readFileSync(f, "utf8");
    const eff = src.split(/\r?\n/).filter((l) => l.trim()).length;
    r = { total: src.split(/\r?\n/).length, comments: 0, blanks: 0, effective: eff };
  } else {
    r = countEffective(readFileSync(f, "utf8"));
  }
  const agg = byExt.get(e) ?? { total: 0, comments: 0, blanks: 0, effective: 0, files: 0 };
  agg.total += r.total; agg.comments += r.comments; agg.blanks += r.blanks; agg.effective += r.effective; agg.files++;
  byExt.set(e, agg);
  grand.total += r.total; grand.comments += r.comments; grand.blanks += r.blanks; grand.effective += r.effective;
}

console.log("Effective lines by file type (comments and blank lines excluded):");
const order = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".java", ".json"];
for (const e of order) {
  const a = byExt.get(e);
  if (a) console.log(`  ${e.padEnd(6)} files ${String(a.files).padStart(3)}  effective ${String(a.effective).padStart(6)}  (of ${a.total} total, ${a.comments} comment, ${a.blanks} blank)`);
}
console.log(`\nALL: ${files.length} files, ${grand.effective} effective lines of ${grand.total} total (comments ${grand.comments}, blanks ${grand.blanks})`);

// code-only (exclude JSON data)
let codeEff = 0, codeFiles = 0;
for (const [e, a] of byExt) if (e !== ".json") { codeEff += a.effective; codeFiles += a.files; }
console.log(`Code only (no JSON data): ${codeFiles} files, ${codeEff} effective lines`);
