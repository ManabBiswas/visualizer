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

async function testSample(name: string, source: string) {
  await Parser.init({
    locateFile: () => join(process.cwd(), "lib/parser/wasm", "web-tree-sitter.wasm"),
  });
  const lang = await Language.load(new Uint8Array(readFileSync(join(process.cwd(), "lib/parser/wasm", "tree-sitter-cpp.wasm"))));
  const parser = new Parser();
  parser.setLanguage(lang);
  
  const cleanSource = normalizeCpp(stripPreprocessor(source));
  console.log(`\n=== ${name} ===`);
  console.log("Clean source:\n", cleanSource);
  
  const tree = parser.parse(cleanSource);
  console.log("Tree:", tree ? "OK" : "NULL");
  if (tree) {
    console.log("Root type:", tree.rootNode.type);
    console.log("Root hasError:", tree.rootNode.hasError);
    console.log("Root children:", tree.rootNode.namedChildren.map((c: any) => c.type));
    tree.rootNode.namedChildren.forEach((c: any) => {
      console.log("  Child:", c.type, c.text.substring(0, 80));
      if (c.namedChildren.length) {
        c.namedChildren.forEach((cc: any) => console.log("    ", cc.type, cc.text.substring(0, 60)));
      }
    });
    tree.delete();
  }
}

const samples = [
  {
    name: "cpp-hello",
    source: `// complexity: time O(1), space O(1) for the output
#include <iostream>

int main() {
    // why: print a greeting to the console
    std::cout << "Hello, World!" << std::endl;
    // q: why use std::endl instead of "\n"?
    return 0;
}`
  },
  {
    name: "cpp-binary-search",
    source: `// why: each iteration halves the search range
// complexity: time O(log n), space O(1)
#include <vector>
using namespace std;

int search(vector<int>& arr, int target) {
    int low = 0, high = arr.size() - 1;
    // q: why use low + (high - low) / 2 instead of (low + high) / 2?
    while (low <= high) {
        int mid = low + (high - low) / 2;
        // note: mid belongs to the current search range
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`
  },
  {
    name: "cpp-two-sum",
    source: `// complexity: time O(n), space O(n) for the map
// q: why do we check the map before inserting the current value?
#include <vector>
#include <unordered_map>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];
        if (seen.count(complement)) {
            return { seen[complement], i };
        }
        seen[nums[i]] = i;
    }
    return {};
}`
  },
  {
    name: "cpp-valid-parentheses",
    source: `// complexity: time O(n), space O(n) for the stack
// why: stack of opening brackets — every closing must match the top
#include <string>
#include <stack>
using namespace std;

bool isValid(string s) {
    stack<char> st;
    for (char ch : s) {
        switch (ch) {
            case '(': st.push(')'); break;
            case '[': st.push(']'); break;
            case '{': st.push('}'); break;
            // q: why do we both check empty and peek?
            default:
                if (st.empty() || st.top() != ch) return false;
                st.pop();
        }
    }
    return st.empty();
}`
  },
];

async function run() {
  for (const s of samples) {
    await testSample(s.name, s.source);
  }
}
run().catch(console.error);