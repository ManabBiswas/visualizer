import { readFileSync } from "fs";
import { join } from "path";
import { Parser, Language } from "web-tree-sitter";

async function testAST(name: string, source: string) {
  await Parser.init({
    locateFile: () => join(process.cwd(), "lib/parser/wasm", "web-tree-sitter.wasm"),
  });
  const lang = await Language.load(new Uint8Array(readFileSync(join(process.cwd(), "lib/parser/wasm", "tree-sitter-cpp.wasm"))));
  const parser = new Parser();
  parser.setLanguage(lang);
  
  const tree = parser.parse(source);
  console.log(`\n=== ${name} ===`);
  if (tree) {
    printNode(tree.rootNode, 0);
    tree.delete();
  }
}

function printNode(node: any, indent: number) {
  const prefix = "  ".repeat(indent);
  console.log(`${prefix}${node.type}: "${node.text.substring(0, 50).replace(/\n/g, ' ')}"`);
  if (node.namedChildren && node.namedChildren.length) {
    for (const child of node.namedChildren) {
      printNode(child, indent + 1);
    }
  }
}

const samples = [
  {
    name: "range-for",
    source: `for (char ch : s) { st.push(ch); }`
  },
  {
    name: "cpp-hello",
    source: `int main() { cout << "Hello" << endl; return 0; }`
  },
  {
    name: "for-loop",
    source: `for (int i = 0; i < nums.size(); i++) { seen[nums[i]] = i; }`
  },
];

async function run() {
  for (const s of samples) {
    await testAST(s.name, s.source);
  }
}
run().catch(console.error);