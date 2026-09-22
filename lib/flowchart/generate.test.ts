import { describe, it, expect } from "vitest";
import { generateFlowchart, generateFlowchartWithTooltips, generateWholeProgramFlowchart } from "./generate";
import { MethodIR, ProgramIR } from "@/lib/ir";

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

describe("generateWholeProgramFlowchart", () => {
  function program(classes: ProgramIR["classes"]): ProgramIR {
    return { classes };
  }

  it("renders each class as a subgraph with methods nested inside", () => {
    const m1 = method({ name: "search", startLine: 1, endLine: 4, body: [{ type: "return", line: 4, value: "-1" }] });
    const m2 = method({ name: "helper", startLine: 6, endLine: 9, body: [{ type: "return", line: 9, value: "0" }] });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m1] }, { name: "Util", methods: [m2] }]));
    expect(result.diagram).toContain("subgraph Solution");
    expect(result.diagram).toContain("subgraph Util");
    expect(result.diagram).toContain("subgraph Solution_search");
    expect(result.diagram).toContain("subgraph Util_helper");
    expect(result.diagram).toContain("search()");
    expect(result.diagram).toContain("helper()");
  });

  it("emits dotted cross-method edges when one defined method calls another", () => {
    const caller = method({
      name: "run",
      startLine: 1,
      endLine: 3,
      body: [
        { type: "call", line: 2, target: "helper", args: "x", isRecursive: false },
        { type: "return", line: 3, value: "0" },
      ],
      calls: ["helper"],
    });
    const helper = method({
      name: "helper",
      startLine: 5,
      endLine: 7,
      body: [{ type: "return", line: 7, value: "0" }],
      calls: [],
    });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [caller, helper] }]));
    // Cross-method edge targets the top-level header (suffix `_h`), NOT a
    // header nested inside the target's body subgraph — landing on a nested
    // header is what caused the arrows in the screenshot to get clipped at
    // the box edge.
    expect(result.diagram).toMatch(/Solution_run_n\d+ -.-> Solution_helper_h/);
    expect(result.diagram).toContain("onWholeProgramMethodClick(\"helper\")");
    // Cross-method call paths are styled bold so the hierarchy is scannable.
    expect(result.diagram).toMatch(/linkStyle \d+ stroke-width:3px/);
  });

  it("does not emit a cross-method edge for self-recursion (stays inside the method)", () => {
    const recur = method({
      name: "walk",
      startLine: 1,
      endLine: 4,
      body: [
        { type: "call", line: 2, target: "walk", args: "n - 1", isRecursive: true },
        { type: "return", line: 4, value: "0" },
      ],
      calls: ["walk"],
    });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [recur] }]));
    // No dotted cross-method edge to a separate subgraph named "Solution_walk" — the
    // call renders inside the same subgraph with the recursion style class instead.
    expect(result.diagram).not.toMatch(/Solution_walk_n\d+ -.-> Solution_walk/);
    expect(result.diagram).toContain(":::recursion");
  });

  it("collects external library calls into a shared dimmed pool", () => {
    const m = method({
      name: "main",
      startLine: 1,
      endLine: 4,
      body: [
        { type: "call", line: 2, target: "Arrays.sort", args: "arr", isRecursive: false },
        { type: "call", line: 3, target: "Arrays.sort", args: "arr2", isRecursive: false },
        { type: "return", line: 4, value: "0" },
      ],
      calls: ["Arrays.sort"],
    });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m] }]));
    // Single external node for the deduped call.
    expect(result.diagram.match(/ext\d+\["/g)?.length).toBe(1);
    expect(result.diagram).toContain(":::external");
  });

  it("populates the methods index so the panel can wire click-to-switch", () => {
    const m = method({ name: "search", startLine: 10, endLine: 20 });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m] }]));
    expect(result.methods.size).toBe(1);
    const entry = [...result.methods.values()][0];
    expect(entry.methodName).toBe("search");
    expect(entry.className).toBe("Solution");
    expect(entry.line).toBe(10);
  });

  it("emits tooltips for every statement, decision, loop, call, and note node", () => {
    const m = method({
      name: "twoSum",
      startLine: 1,
      endLine: 10,
      body: [
        { type: "statement", line: 2, text: "int n = nums.length;" },
        { type: "loop", kind: "for", line: 3, endLine: 8, boundType: "input-dependent", condition: "i < n", body: [
          { type: "call", line: 4, target: "helper", args: "i", isRecursive: false },
        ] },
        { type: "return", line: 10, value: "null" },
      ],
      calls: ["helper"],
      comments: [{ line: 5, tag: "q", text: "why this loop bound?" }],
    });
    const helper = method({ name: "helper", startLine: 12, endLine: 14, body: [{ type: "return", line: 14, value: "0" }] });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m, helper] }]));
    expect(result.tooltips.size).toBeGreaterThan(0);
    const texts = [...result.tooltips.values()].join("\n");
    expect(texts).toContain("i < n");
    expect(texts).toContain("helper(i)");
    expect(texts).toContain("// q: why this loop bound?");
  });

  it("works for a single-method program (no inter-method edges, but still nested subgraph)", () => {
    const m = method({ name: "search", startLine: 1, endLine: 5 });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m] }]));
    expect(result.diagram).toContain("subgraph Solution_search");
    expect(result.methods.size).toBe(1);
  });

  it("emits method headers at the top level of the class subgraph (not nested inside the body subgraph)", () => {
    // Regression for the screenshot bug: when method headers lived inside the
    // body subgraph, cross-method arrows had to cross two nested subgraph
    // bounds and got clipped at the box edge. The fix puts each header at the
    // top level so cross-method arrows only have to cross one.
    const m1 = method({ name: "a", startLine: 1, endLine: 3, body: [{ type: "return", line: 3, value: "0" }] });
    const m2 = method({
      name: "b",
      startLine: 5,
      endLine: 7,
      body: [{ type: "call", line: 6, target: "a", args: "", isRecursive: false }, { type: "return", line: 7, value: "0" }],
      calls: ["a"],
    });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m1, m2] }]));
    // Headers use the `_h` suffix and live OUTSIDE the body subgraph (i.e.
    // before `subgraph Solution_a` in the source).
    expect(result.diagram).toMatch(/Solution_a_h\(\[".*"\]\):::/);
    expect(result.diagram).toMatch(/Solution_b_h\(\[".*"\]\):::/);
    const headerPos = result.diagram.indexOf("Solution_a_h");
    const bodyPos = result.diagram.indexOf("subgraph Solution_a");
    expect(headerPos).toBeLessThan(bodyPos);
  });

  it("connects the first body node to the top-level header (so the entry arrow leaves the body subgraph cleanly)", () => {
    const m = method({ name: "search", startLine: 1, endLine: 5, body: [{ type: "return", line: 5, value: "-1" }] });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m] }]));
    // First body node is whatever walks from the header; for a return-only
    // body that's the return node. The arrow comes FROM the top-level header
    // (outside the body subgraph).
    expect(result.diagram).toMatch(/Solution_search_h --> Solution_search_n\d+/);
  });

  it("stacks methods vertically inside the class subgraph (direction TB) so the diagram doesn't sprawl horizontally", () => {
    // Regression for the "is it really useful?" screenshot: without
    // direction TB, dagre laid out sibling method subgraphs side-by-side,
    // producing a 2000+ pixel wide diagram. The fix stacks them vertically.
    const m1 = method({ name: "a", startLine: 1, endLine: 3, body: [{ type: "return", line: 3, value: "0" }] });
    const m2 = method({ name: "b", startLine: 5, endLine: 7, body: [{ type: "return", line: 7, value: "0" }] });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [m1, m2] }]));
    // direction TB appears right after the class subgraph opens.
    expect(result.diagram).toMatch(/subgraph Solution\["Solution"\]\s*\n\s*direction TB/);
  });

  it("highlights entry-point method headers with the entryNode class (green border)", () => {
    // `main` is called by nothing, so it's an entry point. `helper` is
    // called by `main`, so it's not.
    const main = method({
      name: "main",
      startLine: 1,
      endLine: 5,
      body: [{ type: "call", line: 2, target: "helper", args: "", isRecursive: false }, { type: "return", line: 5, value: "0" }],
      calls: ["helper"],
    });
    const helper = method({
      name: "helper",
      startLine: 7,
      endLine: 9,
      body: [{ type: "return", line: 9, value: "0" }],
      calls: [],
    });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [main, helper] }]));
    // main has no inbound edges → entryNode class
    expect(result.diagram).toMatch(/Solution_main_h\(\[".*"\]\):::entryNode/);
    // helper is called by main → startNode (regular) class
    expect(result.diagram).toMatch(/Solution_helper_h\(\[".*"\]\):::startNode/);
    // And the entryNode classDef is emitted
    expect(result.diagram).toContain("classDef entryNode");
  });

  it("emits methods in topological call order (entry first, callees after)", () => {
    // Declared callee-first to prove the sort reorders them. Mermaid's dagre
    // reads nodes top-to-bottom by source order, so this is what produces the
    // "entry on top, callees below" hierarchy.
    const leaf = method({ name: "leaf", startLine: 1, endLine: 3, body: [{ type: "return", line: 3, value: "0" }], calls: [] });
    const mid = method({
      name: "mid",
      startLine: 5,
      endLine: 7,
      body: [{ type: "call", line: 6, target: "leaf", args: "", isRecursive: false }, { type: "return", line: 7, value: "0" }],
      calls: ["leaf"],
    });
    const entry = method({
      name: "entry",
      startLine: 9,
      endLine: 11,
      body: [{ type: "call", line: 10, target: "mid", args: "", isRecursive: false }, { type: "return", line: 11, value: "0" }],
      calls: ["mid"],
    });
    // Intentionally declare in reverse call order: leaf, mid, entry.
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [leaf, mid, entry] }]));
    const entryPos = result.diagram.indexOf("Solution_entry_h");
    const midPos = result.diagram.indexOf("Solution_mid_h");
    const leafPos = result.diagram.indexOf("Solution_leaf_h");
    expect(entryPos).toBeGreaterThan(-1);
    expect(entryPos).toBeLessThan(midPos);
    expect(midPos).toBeLessThan(leafPos);
  });

  it("styles cross-method call edges bold via linkStyle with numeric edge indices", () => {
    const caller = method({
      name: "caller",
      startLine: 1,
      endLine: 3,
      body: [{ type: "call", line: 2, target: "callee", args: "", isRecursive: false }, { type: "return", line: 3, value: "0" }],
      calls: ["callee"],
    });
    const callee = method({ name: "callee", startLine: 5, endLine: 7, body: [{ type: "return", line: 7, value: "0" }], calls: [] });
    const result = generateWholeProgramFlowchart(program([{ name: "Solution", methods: [caller, callee] }]));
    // linkStyle takes a number (edge declaration order), not an edge-id string.
    expect(result.diagram).toMatch(/linkStyle \d+ stroke-width:3px/);
    expect(result.diagram).not.toMatch(/linkStyle xe/);
    expect(result.diagram).toMatch(/caller_n\d+ -.-> callee_h|Solution_caller_n\d+ -.-> Solution_callee_h/);
  });
});
