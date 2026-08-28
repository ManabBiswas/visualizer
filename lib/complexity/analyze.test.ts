import { describe, it, expect } from "vitest";
import { analyzeComplexity } from "./analyze";
import { MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";

function method(body: StatementNode[]): MethodIR {
  return {
    name: "solve",
    signature: "void solve(int n)",
    params: [{ name: "n", type: "int" }],
    returnType: "void",
    startLine: 1,
    endLine: 10,
    body,
    calls: [],
    comments: [],
  };
}

const loop = (line: number, body: StatementNode[] = [], boundType: LoopBoundType = "parameter"): StatementNode => ({
  type: "loop",
  kind: "for",
  line,
  endLine: line,
  boundType,
  body,
});

describe("analyzeComplexity", () => {
  it("classifies nested loops as O(n²)", () => {
    const result = analyzeComplexity(method([loop(2, [loop(3)])]));
    expect(result.time.bigO).toBe("O(n\u00B2)");
    expect(result.time.confidence).toBe("High");
  });

  it("classifies no-loop/no-recursion methods as O(1)", () => {
    const result = analyzeComplexity(method([{ type: "statement", line: 2, text: "int x = 1;" }]));
    expect(result.time.bigO).toBe("O(1)");
  });

  it("flags branching recursion without halving as exponential", () => {
    const result = analyzeComplexity(
      method([
        { type: "call", line: 2, target: "f", args: "n - 1", isRecursive: true },
        { type: "call", line: 2, target: "f", args: "n - 2", isRecursive: true },
        { type: "return", line: 2, value: "f(n - 1) + f(n - 2)" },
      ])
    );
    expect(result.time.bigO).toContain("2^n");
    expect(result.time.confidence).toBe("Low");
  });

  it("classifies halving single recursion as O(log n)", () => {
    const result = analyzeComplexity(
      method([
        { type: "statement", line: 2, text: "int mid = lo + (hi - lo) / 2;" },
        { type: "call", line: 3, target: "bs", args: "arr, mid + 1, hi", isRecursive: true },
      ])
    );
    expect(result.time.bigO).toBe("O(log n)");
    expect(result.space.bigO).toBe("O(log n)");
  });

  it("classifies merge-sort shaped recursion as O(n log n)", () => {
    const result = analyzeComplexity(
      method([
        { type: "statement", line: 2, text: "int m = l + (r - l) / 2;" },
        { type: "call", line: 3, target: "mergeSort", args: "a, l, m", isRecursive: true },
        { type: "call", line: 4, target: "mergeSort", args: "a, m + 1, r", isRecursive: true },
        { type: "call", line: 5, target: "merge", args: "a, l, m, r", isRecursive: false },
      ])
    );
    expect(result.time.bigO).toBe("O(n log n)");
  });

  it("detects the iterative binary-search halving loop", () => {
    const result = analyzeComplexity(
      method([
        { type: "statement", line: 2, text: "int low = 0, high = n - 1;" },
        loop(3, [{ type: "statement", line: 4, text: "int mid = low + (high - low) / 2;" }], "input-dependent"),
      ])
    );
    expect(result.time.bigO).toBe("O(log n)");
  });

  it("lets a sorting call dominate a single loop", () => {
    const result = analyzeComplexity(
      method([
        { type: "call", line: 2, target: "Arrays.sort", args: "a", isRecursive: false },
        loop(3),
      ])
    );
    expect(result.time.bigO).toBe("O(n log n)");
    expect(result.time.explanation).toContain("Arrays.sort");
  });

  it("reports O(n) space when an auxiliary structure is allocated in a loop", () => {
    const result = analyzeComplexity(
      method([loop(2, [{ type: "statement", line: 3, text: "tmp = new ArrayList<>();" }])])
    );
    expect(result.space.bigO).toBe("O(n)");
  });

  it("lowers confidence for input-dependent loop bounds", () => {
    const result = analyzeComplexity(method([loop(2, [], "input-dependent")]));
    expect(result.time.confidence).toBe("Medium");
    expect(result.time.explanation).toContain("input-dependent");
  });
});
