import { describe, it, expect } from "vitest";
import { analyzeBlockComplexity } from "./blocks";
import { MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";

function method(body: StatementNode[]): MethodIR {
  return {
    name: "solve",
    signature: "void solve(int n)",
    params: [{ name: "n", type: "int" }],
    returnType: "void",
    startLine: 1,
    endLine: 20,
    body,
    calls: [],
    comments: [],
  };
}

const loop = (line: number, body: StatementNode[] = [], boundType: LoopBoundType = "input-dependent"): StatementNode => ({
  type: "loop",
  kind: "for",
  line,
  endLine: line,
  boundType,
  body,
});

describe("analyzeBlockComplexity", () => {
  it("annotates a single input-bound loop as O(n) time / O(1) space", () => {
    const blocks = analyzeBlockComplexity(
      method([loop(2, [{ type: "statement", line: 3, text: "s += arr[i];" }])]),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("loop");
    expect(blocks[0].time).toBe("O(n)");
    expect(blocks[0].space).toBe("O(1)");
  });

  it("annotates a constant-bound loop as O(1)", () => {
    const blocks = analyzeBlockComplexity(method([loop(2, [], "constant")]));
    expect(blocks[0].time).toBe("O(1)");
  });

  it("detects a halving loop as O(log n)", () => {
    const blocks = analyzeBlockComplexity(
      method([
        loop(2, [{ type: "statement", line: 3, text: "high = (low + high) / 2;" }]),
      ]),
    );
    expect(blocks[0].time).toBe("O(log n)");
  });

  it("flags auxiliary allocation inside a loop as O(n) space", () => {
    const blocks = analyzeBlockComplexity(
      method([loop(2, [{ type: "statement", line: 3, text: "List<Integer> tmp = new ArrayList<>();" }])]),
    );
    expect(blocks[0].space).toBe("O(n)");
  });

  it("emits an entry for every nested loop", () => {
    const blocks = analyzeBlockComplexity(method([loop(2, [loop(3)])]));
    expect(blocks.filter((b) => b.kind === "loop")).toHaveLength(2);
  });

  it("uses known library costs for calls", () => {
    const blocks = analyzeBlockComplexity(
      method([{ type: "call", line: 2, target: "Arrays.sort", args: "arr", isRecursive: false }]),
    );
    expect(blocks[0].kind).toBe("call");
    expect(blocks[0].time).toBe("O(n log n)");
    expect(blocks[0].space).toBe("O(n)");
  });

  it("marks recursive calls", () => {
    const blocks = analyzeBlockComplexity(
      method([{ type: "call", line: 2, target: "solve", args: "n - 1", isRecursive: true }]),
    );
    expect(blocks[0].time).toBe("recursive");
    expect(blocks[0].space).toBe("O(depth)");
  });

  it("marks unknown user calls as O(?)", () => {
    const blocks = analyzeBlockComplexity(
      method([{ type: "call", line: 2, target: "helper", args: "x", isRecursive: false }]),
    );
    expect(blocks[0].time).toBe("O(?)");
  });

  it("walks into if branches", () => {
    const blocks = analyzeBlockComplexity(
      method([
        {
          type: "if",
          line: 2,
          branches: [{ condition: "x > 0", body: [loop(3)] }],
        },
      ]),
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe("loop");
  });
});
