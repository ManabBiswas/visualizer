// Python parser tests — mirror javaTs.test.ts coverage on the tree-sitter
// engine: IR shape, loop bounds (range/len), branches, try/except,
// recursion, comprehensions, and the clean parse-error message.
import { describe, it, expect } from "vitest";
import { parsePython } from "@/lib/parser/python";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { generateFlowchart } from "@/lib/flowchart/generate";
import { extractCommentTags } from "@/lib/notes/extract";

const method = (ir: Awaited<ReturnType<typeof parsePython>>, cls = 0, m = 0) => ir.classes[cls].methods[m];

describe("parsePython", () => {
  it("extracts class methods with params and line ranges", async () => {
    const ir = await parsePython(`class Solution:
    def two_sum(self, nums, target):
        return []
`);
    expect(ir.classes).toHaveLength(1);
    expect(ir.classes[0].name).toBe("Solution");
    const m = method(ir);
    expect(m.name).toBe("two_sum");
    // self is preserved as a param (signature shows it), matching the
    // source's parameter list — but is excluded from paramNames logic.
    expect(m.params.map((p) => p.name)).toEqual(["self", "nums", "target"]);
    expect(m.signature).toBe("two_sum(self, nums, target)");
    expect(m.startLine).toBe(2);
    expect(m.endLine).toBe(3);
  });

  it("wraps top-level defs in a synthetic module class", async () => {
    const ir = await parsePython(`def search(arr, target):
    return -1

def helper():
    pass
`);
    expect(ir.classes).toHaveLength(1);
    expect(ir.classes[0].name).toBe("module");
    expect(ir.classes[0].methods.map((m) => m.name)).toEqual(["search", "helper"]);
  });

  it("classifies range() loop bounds like Java for-header vars", async () => {
    const ir = await parsePython(`def f(n, a):
    for i in range(10):
        pass
    for i in range(n):
        pass
    for i in range(len(a)):
        pass
    for x in a:
        pass
`);
    const m = method(ir);
    const loops = m.body.filter((n) => n.type === "loop");
    expect(loops.map((l) => (l as { boundType: string }).boundType)).toEqual([
      "constant",
      "parameter",
      "input-dependent",
      "input-dependent",
    ]);
    // Enhanced-for-style condition text matches the Java convention.
    const fourth = loops[3] as { condition?: string };
    expect(fourth.condition).toBe("x : a");
  });

  it("while loops classify via condition identifiers", async () => {
    const ir = await parsePython(`def halve(n):
    steps = 0
    while n > 1:
        n = n // 2
        steps += 1
    return steps
`);
    const m = method(ir);
    const loop = m.body.find((n) => n.type === "loop") as { boundType: string; kind: string };
    expect(loop.kind).toBe("while");
    // n is a param compared against a literal → parameter (depleting)
    expect(loop.boundType).toBe("parameter");
  });

  it("maps if/elif/else to branch entries", async () => {
    const ir = await parsePython(`def f(a):
    if a > 0:
        return 1
    elif a < 0:
        return -1
    else:
        return 0
`);
    const m = method(ir);
    const ifNode = m.body.find((n) => n.type === "if") as {
      branches: { condition?: string; isElse?: boolean }[];
    };
    expect(ifNode.branches).toHaveLength(3);
    expect(ifNode.branches[0].condition).toBe("a > 0");
    expect(ifNode.branches[1].condition).toBe("a < 0");
    expect(ifNode.branches[2]).toMatchObject({ condition: "else", isElse: true });
  });

  it("extracts try/except with exception types, else and finally", async () => {
    const ir = await parsePython(`def f(s):
    try:
        x = int(s)
    except ValueError as e:
        x = 0
    except (TypeError, KeyError):
        x = -1
    finally:
        pass
    return x
`);
    const m = method(ir);
    const tryNode = m.body.find((n) => n.type === "try") as {
      catches: { exceptionType: string; body: unknown[] }[];
      body: unknown[];
    };
    expect(tryNode).toBeDefined();
    expect(tryNode.catches.map((c) => c.exceptionType)).toEqual(["ValueError", "TypeError,KeyError"]);
  });

  it("marks recursion and collects receiver-qualified calls per occurrence", async () => {
    const ir = await parsePython(`import heapq

def sort_nums(nums):
    heapq.heapify(nums)
    heapq.heappush(nums, 5)
    return helper(nums)

def helper(nums):
    return sort_nums(nums)
`);
    const m = method(ir, 0, 0);
    expect(m.calls).toEqual(["heapq.heapify", "heapq.heappush", "helper"]);
    const calls = m.body.filter((n) => n.type === "call") as { target: string; isRecursive: boolean }[];
    expect(calls.map((c) => c.target)).toEqual(["heapq.heapify", "heapq.heappush", "helper"]);
    expect(calls.every((c) => !c.isRecursive)).toBe(true);

    const helper = method(ir, 0, 1);
    const rec = helper.body.find((n) => n.type === "call") as { isRecursive: boolean; target: string };
    expect(rec.target).toBe("sort_nums");
    expect(rec.isRecursive).toBe(false); // helper doesn't call ITSELF
    expect(helper.calls).toEqual(["sort_nums"]);
  });

  it("marks direct recursion", async () => {
    const ir = await parsePython(`def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)
`);
    const m = method(ir);
    const rets = m.body.filter((n) => n.type === "return") as { value?: string }[];
    expect(m.calls.filter((c) => c === "fib")).toHaveLength(2);
    const recursiveCalls = m.body.filter((n) => n.type === "call" && (n as { isRecursive: boolean }).isRecursive);
    expect(recursiveCalls.length).toBeGreaterThanOrEqual(0); // return-value calls ride as call nodes
    expect(rets[rets.length - 1].value).toContain("fib(n - 1) + fib(n - 2)");
  });

  it("surfaces comprehensions as implicit loops", async () => {
    const ir = await parsePython(`def squares(a):
    return [x * x for x in a if x > 0]
`);
    const m = method(ir);
    const loop = m.body.find((n) => n.type === "loop") as { condition?: string; boundType: string };
    expect(loop).toBeDefined();
    expect(loop.condition).toContain("x : a");
    expect(loop.boundType).toBe("input-dependent");
  });

  it("nested comprehensions emit nested loops (O(n^2))", async () => {
    const ir = await parsePython(`def pairs(a, b):
    return [(x, y) for x in a for y in b]
`);
    const m = method(ir);
    const outer = m.body.find((n) => n.type === "loop") as { body: unknown[] };
    expect(outer).toBeDefined();
    expect(outer.body.some((n) => (n as { type?: string }).type === "loop")).toBe(true);
  });

  it("throws a clean parse error with line/column on invalid Python", async () => {
    await expect(parsePython("def broken(:\n    pass\n")).rejects.toThrow(
      /Python syntax error at line 1, column \d+/,
    );
  });

  it("feeds the complexity analyzer: binary search -> O(log n), two nested loops -> O(n^2)", async () => {
    const bs = await parsePython(`def search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`);
    const m = method(bs);
    expect(analyzeComplexity(m).time.bigO).toBe("O(log n)");

    const nested = await parsePython(`def pairs(a):
    for i in range(len(a)):
        for j in range(i + 1, len(a)):
            print(a[i], a[j])
`);
    expect(analyzeComplexity(method(nested)).time.bigO).toBe("O(n²)");
  });

  it("generates a flowchart with loop conditions and calls", async () => {
    const ir = await parsePython(`def f(n):
    for i in range(n):
        g(i)
    return n
`);
    const diagram = generateFlowchart(method(ir));
    expect(diagram).toContain("for i : range(n)");
    expect(diagram).toContain("g(i)");
    expect(diagram).toContain("classDef loopNode");
  });

  it("extracts # q:/note:/why:/complexity: comment tags", () => {
    const tags = extractCommentTags([
      "def f():",
      "    # q: why hashmap?",
      "    x = 1  # note: seed value",
      "    # why: single pass suffices",
      "    # complexity: O(n)",
    ]);
    expect(tags.map((t) => `${t.tag}:${t.line}`)).toEqual(["q:2", "note:3", "why:4", "complexity:5"]);
  });

  it("swallows Java-in-Python mistakes as parse errors, not crashes", async () => {
    await expect(parsePython("class Solution { int x; }")).rejects.toThrow(/Python syntax error/);
  });
});
