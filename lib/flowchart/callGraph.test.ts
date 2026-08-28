import { describe, it, expect } from "vitest";
import { generateCallGraph } from "./callGraph";
import { ProgramIR, MethodIR } from "@/lib/ir";

function method(name: string, calls: string[]): MethodIR {
  return {
    name,
    signature: `void ${name}()`,
    params: [],
    returnType: "void",
    startLine: 1,
    endLine: 5,
    body: [],
    calls,
    comments: [],
  };
}

function program(methods: MethodIR[]): ProgramIR {
  return { classes: [{ name: "Solution", methods }] };
}

describe("generateCallGraph", () => {
  it("returns null for single-method problems (tab stays hidden)", () => {
    expect(generateCallGraph(program([method("solve", ["Arrays.sort"])]))).toBeNull();
  });

  it("renders internal methods as nodes with edges between them", () => {
    const diagram = generateCallGraph(
      program([method("solve", ["dfs"]), method("dfs", ["solve", "dfs"])])
    );
    expect(diagram).not.toBeNull();
    expect(diagram).toContain("graph LR");
    expect(diagram).toContain('["solve()"]:::internal');
    expect(diagram).toContain('["dfs()"]:::internal');
    expect(diagram).toMatch(/m1 --> m2/);
    expect(diagram).toMatch(/m2 --> m1/); // mutual recursion
    expect(diagram).toMatch(/m2 --> m2/); // self recursion
  });

  it("renders qualified library calls as dimmed external leaf nodes", () => {
    const diagram = generateCallGraph(
      program([method("solve", ["Arrays.sort", "helper"]), method("helper", [])])
    )!;
    expect(diagram).toContain('["Arrays.sort"]:::external');
    expect(diagram).toContain("stroke-dasharray:3 3");
  });

  it("skips unqualified external calls to avoid noise", () => {
    const diagram = generateCallGraph(
      program([method("solve", ["println", "helper"]), method("helper", [])])
    )!;
    expect(diagram).not.toContain("println");
  });

  it("dedupes repeated calls into a single edge", () => {
    const diagram = generateCallGraph(
      program([method("solve", ["dfs", "dfs", "dfs"]), method("dfs", [])])
    )!;
    expect(diagram.match(/m1 --> m2/g)).toHaveLength(1);
  });

  it("wires click bindings only for internal methods", () => {
    const diagram = generateCallGraph(
      program([method("solve", ["Arrays.sort", "dfs"]), method("dfs", [])])
    )!;
    expect(diagram).toContain('click m1 call onCallGraphNodeClick("solve")');
    expect(diagram).toContain('click m2 call onCallGraphNodeClick("dfs")');
    expect(diagram).not.toContain('call onCallGraphNodeClick("Arrays.sort")');
  });
});
