import { describe, it, expect } from "vitest";
import { generateCallGraph, generateCallGraphDiagram } from "./callGraph";
import { ProgramIR, MethodIR } from "@/lib/ir";

function method(name: string, calls: string[], body: MethodIR["body"] = []): MethodIR {
  return {
    name,
    signature: name === "dfs" ? "void dfs(int n)" : `void ${name}()`,
    params: name === "dfs" ? [{ name: "n", type: "int" }] : [],
    returnType: "void",
    startLine: 1,
    endLine: 5,
    body,
    calls,
    comments: [],
  };
}

function program(methods: MethodIR[]): ProgramIR {
  return { classes: [{ name: "Solution", methods }] };
}

function makeBinarySearchMethod(name: string, line: number): MethodIR {
  return {
    name,
    signature: `int ${name}(int[] arr, int target)`,
    params: [
      { name: "arr", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returnType: "int",
    startLine: line,
    endLine: line + 10,
    body: [
      {
        type: "loop",
        kind: "while",
        line: line + 1,
        endLine: line + 9,
        boundType: "input-dependent",
        condition: "low <= high",
        body: [{ type: "return", line: line + 5, value: "mid" }],
      },
    ],
    calls: [],
    comments: [],
  };
}

describe("generateCallGraph", () => {
  it("returns null for single-method problems (tab stays hidden)", () => {
    expect(generateCallGraph(program([method("solve", ["Arrays.sort"])]))).toBeNull();
  });

  it("renders internal methods as nodes with edges between them", () => {
    const result = generateCallGraph(
      program([method("solve", ["dfs"]), method("dfs", ["solve", "dfs"])])
    );
    expect(result).not.toBeNull();
    const { diagram } = result!;
    expect(diagram).toContain("graph LR");
    expect(diagram).toContain('["solve()"]:::internal');
    expect(diagram).toContain('["dfs()"]:::internal');
    expect(diagram).toMatch(/m1 --> m2/);
    expect(diagram).toMatch(/m2 --> m1/); // mutual recursion
    expect(diagram).toMatch(/m2 --> m2/); // self recursion
  });

  it("renders qualified library calls as dimmed external leaf nodes", () => {
    const { diagram } = generateCallGraph(
      program([method("solve", ["Arrays.sort", "helper"]), method("helper", [])])
    )!;
    expect(diagram).toContain('["Arrays.sort"]:::external');
    expect(diagram).toContain("stroke-dasharray:3 3");
  });

  it("skips unqualified external calls to avoid noise", () => {
    const { diagram } = generateCallGraph(
      program([method("solve", ["println", "helper"]), method("helper", [])])
    )!;
    expect(diagram).not.toContain("println");
  });

  it("dedupes repeated calls into a single edge", () => {
    const { diagram } = generateCallGraph(
      program([method("solve", ["dfs", "dfs", "dfs"]), method("dfs", [])])
    )!;
    expect(diagram.match(/m1 --> m2/g)).toHaveLength(1);
  });

  it("wires click bindings only for internal methods", () => {
    const { diagram } = generateCallGraph(
      program([method("solve", ["Arrays.sort", "dfs"]), method("dfs", [])])
    )!;
    expect(diagram).toContain('click m1 call onCallGraphNodeClick("solve")');
    expect(diagram).toContain('click m2 call onCallGraphNodeClick("dfs")');
    expect(diagram).not.toContain('call onCallGraphNodeClick("Arrays.sort")');
  });

  it("annotates internal method labels with a complexity badge", () => {
    const { diagram } = generateCallGraph(
      program([makeBinarySearchMethod("solve", 1), method("helper", [])])
    )!;
    // solve is a single-iteration O(n) loop (the synthetic IR doesn't halve),
    // so the badge appears; helper is O(1) so the badge is hidden.
    expect(diagram).toMatch(/solve\(\) · O\(n\)/);
    expect(diagram).not.toMatch(/helper\(\) ·/);
  });

  it("emits a tooltip per internal node with signature, time, space and line count", () => {
    const { tooltips } = generateCallGraph(
      program([makeBinarySearchMethod("search", 10), method("helper", [])])
    )!;
    const solve = tooltips.get("m1") ?? "";
    expect(solve).toContain("int search(int[] arr, int target)");
    expect(solve).toMatch(/time: O\((n|log n)\)/);
    expect(solve).toContain("space: O(1)");
    expect(solve).toContain("L10");
    // helper is O(1) — show it in the tooltip even though the badge is hidden.
    const helper = tooltips.get("m2") ?? "";
    expect(helper).toContain("time: O(1)");
  });

  it("includes the external call's qualified name in its tooltip", () => {
    const { tooltips } = generateCallGraph(
      program([method("solve", ["Arrays.sort", "helper"]), method("helper", [])])
    )!;
    const all = [...tooltips.values()].join("\n");
    expect(all).toContain("external: Arrays.sort");
  });

  it("keeps stable node ids across consecutive calls (same source = same graph)", () => {
    const ir = program([method("solve", ["dfs"]), method("dfs", [])]);
    expect(generateCallGraphDiagram(ir)).toBe(generateCallGraphDiagram(ir));
  });
});
