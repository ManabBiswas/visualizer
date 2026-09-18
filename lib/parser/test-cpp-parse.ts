import { readFileSync } from "fs";
import { join } from "path";
import { Parser, Language } from "web-tree-sitter";

function stripPreprocessor(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

function normalizeCpp(source: string): string {
  return source
    .replace(/\busing\s+namespace\s+[^;]+;/g, "")
    .replace(/\bstd::/g, "")
    .replace(/\bnullptr\b/g, "null")
    .replace(/\bbool\b/g, "boolean");
}

async function test() {
  await Parser.init({
    locateFile: () => join(process.cwd(), "lib/parser/wasm", "web-tree-sitter.wasm"),
  });
  const lang = await Language.load(new Uint8Array(readFileSync(join(process.cwd(), "lib/parser/wasm", "tree-sitter-cpp.wasm"))));
  const parser = new Parser();
  parser.setLanguage(lang);
  
  const source = `// complexity: time O(1), space O(1) for the output
#include <iostream>

int main() {
    // why: print a greeting to the console
    std::cout << "Hello, World!" << std::endl;
    // q: why use std::endl instead of "\n"?
    return 0;
}`;
  
  const cleanSource = normalizeCpp(stripPreprocessor(source));
  console.log("Clean source:\n", cleanSource);
  
  const tree = parser.parse(cleanSource);
  console.log("Tree:", tree ? "OK" : "NULL");
  if (tree) {
    console.log("Root type:", tree.rootNode.type);
    console.log("Root hasError:", tree.rootNode.hasError);
    console.log("Root children:", tree.rootNode.namedChildren.map((c: any) => c.type));
    tree.rootNode.namedChildren.forEach((c: any) => {
      console.log("  Child:", c.type, c.text);
      if (c.namedChildren.length) {
        c.namedChildren.forEach((cc: any) => console.log("    ", cc.type, cc.text));
      }
    });
    tree.delete();
  }
}
test().catch(console.error);