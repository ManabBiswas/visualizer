import { describe, it, expect } from "vitest";
import { generateFlowchart, generateFlowchartWithTooltips } from "./generate";
import { MethodIR } from "@/lib/ir";

function method(overrides: Partial<MethodIR> = {}): MethodIR {
  return {
    name: "search",
    signature: "int search(int[] arr, int target)",
    params: [
      { name: "arr", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returnType: "int",
    startLine: 1,
    endLine: 8,
    body: [
      {
        type: "loop",
        kind: "while",
        line: 2,
        endLine: 6,
        boundType: "input-dependent",
        condition: "low <= high",
        body: [
          { type: "statement", line: 3, text: "int mid = low + (high - low) / 2;" },
          {
            type: "if",
            line: 4,
            branches: [
              { condition: "arr[mid] == target", body: [{ type: "return", line: 4, value: "mid" }] },
              { isElse: true, body: [{ type: "statement", line: 5, text: "low = mid + 1;" }] },
            ],
          },
        ],
      },
      { type: "call", line: 7, target: "Arrays.sort", args: "arr", isRecursive: false },
      { type: "return", line: 8, value: "-1" },
    ],
    calls: ["Arrays.sort"],
    comments: [],
    ...overrides,
  };
}

describe("generateFlowchart", () => {
  it("renders code-centric labels with conditions and line numbers", () => {
    const diagram = generateFlowchart(method());
    // `<`/`>` are escaped for Mermaid's HTML labels
    expect(diagram).toContain("while low #lt;= high");
    expect(diagram).toContain("if arr[mid] == target");
    expect(diagram).toContain("Arrays.sort(arr)");
    expect(diagram).toContain("return -1");
    expect(diagram).toContain("L2");
  });

  it("applies multi-color class definitions", () => {
    const diagram = generateFlowchart(method());
    expect(diagram).toContain("classDef loopNode");
    expect(diagram).toContain("classDef decision");
    expect(diagram).toContain("classDef callNode");
    expect(diagram).toContain("classDef returnNode");
    expect(diagram).toMatch(/:::loopNode/);
    expect(diagram).toMatch(/:::decision/);
  });

  it("styles recursive calls distinctly", () => {
    const diagram = generateFlowchart(
      method({
        body: [{ type: "call", line: 2, target: "f", args: "n - 1", isRecursive: true }],
      })
    );
    expect(diagram).toContain(":::recursion");
  });

  it("embeds tagged comments as dashed note nodes attached to their statements", () => {
    const diagram = generateFlowchart(
      method({
        comments: [
          { line: 3, tag: "why", text: "avoid overflow" },
          { line: 2, tag: "q", text: "why binary search?" },
        ],
      })
    );
    expect(diagram).toContain("[why] avoid overflow");
    expect(diagram).toContain("[q] why binary search?");
    expect(diagram).toContain(":::noteWhy");
    expect(diagram).toContain(":::noteQ");
    expect(diagram).toContain("-.->");
  });

  it("escapes quotes and angle brackets in labels", () => {
    const diagram = generateFlowchart(
      method({
        body: [{ type: "statement", line: 2, text: 'String s = "a<b>";' }],
      })
    );
    expect(diagram).not.toContain('"a<b>"');
    expect(diagram).toContain("#quot;");
    expect(diagram).toContain("#lt;");
  });

  it("produces independent node ids across consecutive calls", () => {
    const a = generateFlowchart(method());
    const b = generateFlowchart(method());
    expect(a).toBe(b);
  });
});

describe("generateFlowchartWithTooltips", () => {
  it("populates nodeByLine so the editor cursor can find its target node", () => {
    const m = method({
      body: [
        { type: "loop", kind: "while", line: 4, endLine: 7, boundType: "input-dependent", condition: "i < n", body: [] },
        { type: "return", line: 8, value: "0" },
      ],
    });
    const { nodeByLine, tooltips } = generateFlowchartWithTooltips(m);
    // start + loop + return (and possibly more) all show up in the cursor map.
    expect(nodeByLine.size).toBeGreaterThan(0);
    // The id for the loop must be the one we get when looking up line 4.
    const loopId = nodeByLine.get(4);
    expect(loopId).toBeDefined();
    expect(tooltips.get(loopId!)).toContain("while (while i < n is true)");
  });

  it("omits lines that have no node from nodeByLine", () => {
    const m = method({
      body: [{ type: "return", line: 5, value: "0" }],
    });
    const { nodeByLine } = generateFlowchartWithTooltips(m);
    expect(nodeByLine.has(99)).toBe(false);
  });
});
