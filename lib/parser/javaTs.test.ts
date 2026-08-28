import { describe, it, expect } from "vitest";
import { parseJavaTs, classifyLoopBound } from "./javaTs";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { generateFlowchart } from "@/lib/flowchart/generate";
import { StatementNode } from "@/lib/ir";

function method(source: string, name = "f") {
  const ir = parseJavaTs(source);
  const m = ir.classes[0]?.methods?.find((x) => x.name === name);
  if (!m) throw new Error(`method ${name} not found`);
  return m;
}

function loops(nodes: StatementNode[]): Extract<StatementNode, { type: "loop" }>[] {
  const out: Extract<StatementNode, { type: "loop" }>[] = [];
  const walk = (ns: StatementNode[]) => {
    for (const n of ns) {
      if (n.type === "loop") {
        out.push(n);
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

describe("parseJavaTs", () => {
  it("extracts class, method, params, return type and line numbers", () => {
    const src = `class Solution {\n    int add(int a, int b) {\n        return a + b;\n    }\n}\n`;
    const ir = parseJavaTs(src);
    expect(ir.classes[0].name).toBe("Solution");
    const m = ir.classes[0].methods[0];
    expect(m.name).toBe("add");
    expect(m.params).toEqual([
      { name: "a", type: "int" },
      { name: "b", type: "int" },
    ]);
    expect(m.returnType).toBe("int");
    expect(m.startLine).toBe(2);
    expect(m.endLine).toBe(4);
    expect(m.body.some((n) => n.type === "return" && n.value === "a + b")).toBe(true);
  });

  it("classifies loop bounds like the Java CLI", () => {
    const src = `class A {
      void f(int[] arr, int n) {
        for (int i = 0; i < arr.length; i++) {}
        for (int i = 0; i < n; i++) {}
        for (int i = 0; i < 10; i++) {}
        for (int x : arr) {}
        while (true) {}
      }
    }`;
    const ls = loops(method(src).body);
    expect(ls.map((l) => l.boundType)).toEqual([
      "input-dependent",
      "parameter",
      "constant",
      "input-dependent",
      "input-dependent",
    ]);
    expect(ls[0].condition).toBe("i < arr.length");
    expect(ls[3].kind).toBe("for"); // enhanced-for uses kind "for" per the IR contract
    expect(ls[3].condition).toContain("x : arr");
  });

  it("captures loop conditions and if branches", () => {
    const src = `class A { int f(int n) {
      if (n <= 1) { return n; } else { return f(n - 1); }
    }}`;
    const m = method(src);
    const ifs = m.body.filter((n) => n.type === "if") as Extract<StatementNode, { type: "if" }>[];
    expect(ifs).toHaveLength(1);
    expect(ifs[0].branches[0].condition).toBe("n <= 1");
    expect(ifs[0].branches[1].condition).toBe("else");
  });

  it("detects recursion including calls hidden in returns", () => {
    const src = `class A { int f(int n) { return n <= 1 ? n : f(n - 1) + f(n - 2); } }`;
    const m = method(src);
    // IR contract: method-level calls is a target string per occurrence
    expect(m.calls.filter((t) => t === "f")).toHaveLength(2);
    expect(m.calls.every((t) => t === "f")).toBe(true);
    // statement-level nodes carry the isRecursive flag for the flowchart
    const ret = m.body.find((n) => n.type === "return");
    expect(ret).toBeDefined();
    const callNodes = m.body.filter((n) => n.type === "call") as Extract<StatementNode, { type: "call" }>[];
    expect(callNodes.filter((c) => c.isRecursive)).toHaveLength(2);
  });

  it("qualifies call targets and captures arguments", () => {
    const src = `class A { void f(int[] a) { Arrays.sort(a); Map<String,Integer> m = new HashMap<>(); m.get("k"); g(1, 2); } void g(int x, int y){} }`;
    const m = method(src);
    expect(m.calls).toContain("Arrays.sort");
    expect(m.calls).toContain("m.get");
    expect(m.calls).toContain("g");
    const callNodes = m.body.filter((n) => n.type === "call") as Extract<StatementNode, { type: "call" }>[];
    const sort = callNodes.find((c) => c.target === "Arrays.sort")!;
    expect(sort.args).toBe("a");
    const g = callNodes.find((c) => c.target === "g")!;
    expect(g.args).toBe("1, 2");
  });

  it("emits switch cases and try/catch structure", () => {
    const src = `class A { void f(int n) {
      switch (n) { case 1: break; default: n++; }
      try { g(); } catch (Exception e) { h(); }
    } void g(){} void h(){} }`;
    const m = method(src);
    const sw = m.body.find((n) => n.type === "switch") as Extract<StatementNode, { type: "switch" }>;
    expect(sw.cases.map((c) => c.label)).toEqual(["case 1", "default"]);
    const tryNode = m.body.find((n) => n.type === "try") as Extract<StatementNode, { type: "try" }>;
    expect(tryNode.catches[0].exceptionType).toContain("Exception");
    expect(tryNode.body.some((n) => n.type === "call" && n.target === "g")).toBe(true);
    expect(tryNode.catches[0].body.some((n) => n.type === "call" && n.target === "h")).toBe(true);
  });

  it("emits bare call statements as call nodes, not generic statements", () => {
    const src = `class A { void f() { g(1); int x = g(2) + 1; } int g(int x){ return x; } }`;
    const m = method(src);
    const bare = m.body.find((n) => n.type === "call" && n.target === "g" && n.args === "1");
    expect(bare).toBeDefined();
    const expr = m.body.find((n) => n.type === "statement" && n.text.includes("int x"));
    expect(expr).toBeDefined();
  });

  it("throws a clean parse error on invalid Java", () => {
    expect(() => parseJavaTs("class { broken")).toThrow(/Parse error/);
  });

  it("feeds the complexity analyzer: binary search -> O(log n), merge sort -> O(n log n)", () => {
    const src = `class Solution {
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
      void mergeSort(int[] a, int l, int r) {
        if (l < r) {
          int m = l + (r - l) / 2;
          mergeSort(a, l, m);
          mergeSort(a, m + 1, r);
          merge(a, l, m, r);
        }
      }
      void merge(int[] a, int l, int m, int r) {}
    }`;
    const ir = parseJavaTs(src);
    const search = ir.classes[0].methods.find((m) => m.name === "search")!;
    const mergeSort = ir.classes[0].methods.find((m) => m.name === "mergeSort")!;
    expect(analyzeComplexity(search).time.bigO).toBe("O(log n)");
    expect(analyzeComplexity(mergeSort).time.bigO).toBe("O(n log n)");
  });

  it("generates a flowchart with loop conditions and call args", () => {
    const src = `class A { void f(int n) { for (int i = 0; i < n; i++) { g(i); } } void g(int x){} }`;
    const diagram = generateFlowchart(method(src));
    // `<` is escaped as `#lt;` for Mermaid labels
    expect(diagram).toContain("for i #lt; n");
    expect(diagram).toContain("g(i)");
    expect(diagram).toContain("classDef loopNode");
  });
});

describe("classifyLoopBound", () => {
  it("handles multi-variable init and digit-free conditions", () => {
    expect(classifyLoopBound("i < n", ["i"], ["n"])).toBe("parameter");
    expect(classifyLoopBound("i < 10", ["i"], [])).toBe("constant");
    expect(classifyLoopBound("i < arr.length", ["i"], [])).toBe("input-dependent");
    expect(classifyLoopBound("i < m.size()", ["i"], [])).toBe("input-dependent");
    expect(classifyLoopBound("true", [], [])).toBe("input-dependent");
    expect(classifyLoopBound("", [], [])).toBe("unknown");
    expect(classifyLoopBound("p.next != null", [], [])).toBe("input-dependent");
  });
});
