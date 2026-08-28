import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { ProgramIR, MethodIR, StatementNode } from "@/lib/ir";
import { parseJavaTs } from "./javaTs";
import { analyzeComplexity } from "@/lib/complexity/analyze";

const ROOT = process.cwd();
const CLASSES_DIR = path.join(ROOT, "parser", "target", "classes");

function findJavaParserJar(): string | null {
  if (process.env.JAVAPARSER_JAR && fs.existsSync(process.env.JAVAPARSER_JAR)) {
    return process.env.JAVAPARSER_JAR;
  }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
  const candidate = path.join(
    home,
    ".m2",
    "repository",
    "com",
    "github",
    "javaparser",
    "javaparser-core",
    "3.26.2",
    "javaparser-core-3.26.2.jar"
  );
  return fs.existsSync(candidate) ? candidate : null;
}

const jar = findJavaParserJar();
const canRunJvm = fs.existsSync(CLASSES_DIR) && jar !== null;

function runJvmParser(source: string): ProgramIR {
  const cp = `${CLASSES_DIR}${path.delimiter}${jar}`;
  const out = execFileSync("java", ["-cp", cp, "codelens.Main"], {
    input: source,
    encoding: "utf-8",
  });
  return JSON.parse(out) as ProgramIR;
}

const FIXTURES: Record<string, string> = {
  binarySearch: `class Solution {
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (arr[mid] == target) { return mid; }
            else if (arr[mid] < target) { low = mid + 1; }
            else { high = mid - 1; }
        }
        return -1;
    }
}`,
  mergeSort: `class Solution {
    void mergeSort(int[] a, int l, int r) {
        if (l < r) {
            int m = l + (r - l) / 2;
            mergeSort(a, l, m);
            mergeSort(a, m + 1, r);
            merge(a, l, m, r);
        }
    }
    void merge(int[] a, int l, int m, int r) {
        for (int i = l; i <= r; i++) { a[i] = 0; }
    }
}`,
  twoSum: `class Solution {
    int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need)) return new int[]{ seen.get(need), i };
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}`,
  dfs: `class Solution {
    int islands(int[][] grid) {
        int count = 0;
        for (int i = 0; i < grid.length; i++) {
            for (int j = 0; j < grid[0].length; j++) {
                if (grid[i][j] == 1) { count++; dfs(grid, i, j); }
            }
        }
        return count;
    }
    void dfs(int[][] grid, int i, int j) {
        if (i < 0 || j < 0 || i >= grid.length || j >= grid[0].length || grid[i][j] == 0) return;
        grid[i][j] = 0;
        dfs(grid, i + 1, j);
        dfs(grid, i - 1, j);
    }
}`,
};

function loopBoundTypes(nodes: StatementNode[]): string[] {
  const out: string[] = [];
  const walk = (ns: StatementNode[]) => {
    for (const n of ns) {
      if (n.type === "loop") {
        out.push(n.boundType);
        walk(n.body);
      } else if (n.type === "if") n.branches.forEach((b) => walk(b.body));
      else if (n.type === "try") {
        walk(n.body);
        n.catches.forEach((c) => walk(c.body));
      } else if (n.type === "switch") n.cases.forEach((c) => walk(c.body));
    }
  };
  walk(nodes);
  return out;
}

function recursiveCallCount(nodes: StatementNode[]): number {
  let count = 0;
  const walk = (ns: StatementNode[]) => {
    for (const n of ns) {
      if (n.type === "call" && n.isRecursive) count++;
      else if (n.type === "loop") walk(n.body);
      else if (n.type === "if") n.branches.forEach((b) => walk(b.body));
      else if (n.type === "try") {
        walk(n.body);
        n.catches.forEach((c) => walk(c.body));
      } else if (n.type === "switch") n.cases.forEach((c) => walk(c.body));
    }
  };
  walk(nodes);
  return count;
}

function methodByName(ir: ProgramIR, name: string): MethodIR {
  for (const cls of ir.classes) {
    const m = (cls.methods ?? []).find((x) => x.name === name);
    if (m) return m;
  }
  throw new Error(`method ${name} missing`);
}

describe.skipIf(!canRunJvm)("TS parser parity with the JVM CLI", () => {
  for (const [fixtureName, source] of Object.entries(FIXTURES)) {
    it(`${fixtureName}: same methods, complexity, loop bounds and call targets`, () => {
      const ts = parseJavaTs(source);
      const jvm = runJvmParser(source);

      expect(ts.classes.map((c) => c.name)).toEqual(jvm.classes.map((c) => c.name));
      for (const cls of jvm.classes) {
        for (const jm of cls.methods ?? []) {
          const tm = methodByName(ts, jm.name);

          expect(tm.params.map((p) => p.name)).toEqual(jm.params.map((p) => p.name));
          expect(tm.returnType).toBe(jm.returnType);

          const tc = analyzeComplexity(tm);
          const jc = analyzeComplexity(jm);
          expect(tc.time.bigO, `time for ${jm.name}`).toBe(jc.time.bigO);
          expect(tc.space.bigO, `space for ${jm.name}`).toBe(jc.space.bigO);

          expect(loopBoundTypes(tm.body), `loop bounds for ${jm.name}`).toEqual(loopBoundTypes(jm.body));

          // IR contract: method-level calls is a target string per occurrence
          expect([...tm.calls].sort(), `call targets for ${jm.name}`).toEqual([...jm.calls].sort());

          expect(recursiveCallCount(tm.body), `recursive calls for ${jm.name}`).toBe(
            recursiveCallCount(jm.body),
          );
        }
      }
    });
  }
});
