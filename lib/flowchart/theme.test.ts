import { describe, it, expect } from "vitest";
import { generateFlowchart } from "./generate";
import { generateCallGraph } from "./callGraph";
import { MethodIR, ProgramIR } from "@/lib/ir";

function method(): MethodIR {
  return {
    name: "search",
    signature: "int search(int[] arr)",
    params: [{ name: "arr", type: "int[]" }],
    returnType: "int",
    startLine: 1,
    endLine: 3,
    body: [
      {
        type: "loop",
        kind: "for",
        line: 2,
        endLine: 2,
        boundType: "input-dependent",
        condition: "i < arr.length",
        body: [{ type: "statement", line: 2, text: "s += arr[i];" }],
      },
      { type: "return", line: 3, value: "s" },
    ],
    calls: [],
    comments: [],
  };
}

function program(): ProgramIR {
  return {
    classes: [
      {
        name: "Solution",
        methods: [
          { name: "a", signature: "void a()", params: [], returnType: "void", startLine: 1, endLine: 2, body: [], calls: ["b"], comments: [] },
          { name: "b", signature: "void b()", params: [], returnType: "void", startLine: 3, endLine: 4, body: [], calls: [], comments: [] },
        ],
      },
    ],
  };
}

describe("theme-aware flowchart generation", () => {
  it("defaults to the dark palette", () => {
    const out = generateFlowchart(method());
    expect(out).toContain("fill:#10141a");
    expect(out).toContain("color:#dfe2eb");
  });

  it("emits dark class definitions for theme=dark", () => {
    const out = generateFlowchart(method(), "dark");
    expect(out).toContain("classDef process fill:#10141a,stroke:#38bdf8");
  });

  it("emits light class definitions for theme=light", () => {
    const out = generateFlowchart(method(), "light");
    expect(out).toContain("classDef process fill:#ffffff,stroke:#0969da");
    expect(out).toContain("color:#1f2328");
    expect(out).not.toContain("fill:#10141a");
  });

  it("keeps node structure identical across themes", () => {
    const dark = generateFlowchart(method(), "dark");
    const light = generateFlowchart(method(), "light");
    const strip = (s: string) => s.split("\n").filter((l) => !l.trim().startsWith("classDef")).join("\n");
    expect(strip(dark)).toBe(strip(light));
  });
});

describe("theme-aware call graph generation", () => {
  it("returns null for a single-method program", () => {
    const single: ProgramIR = {
      classes: [{ name: "S", methods: [program().classes[0].methods[0]] }],
    };
    expect(generateCallGraph(single)).toBeNull();
  });

  it("emits dark class definitions by default", () => {
    const out = generateCallGraph(program())!.diagram;
    expect(out).toContain("classDef internal fill:#10141a,stroke:#38bdf8");
  });

  it("emits light class definitions for theme=light", () => {
    const out = generateCallGraph(program(), "onCallGraphNodeClick", "light")!.diagram;
    expect(out).toContain("classDef internal fill:#ffffff,stroke:#0969da");
    expect(out).not.toContain("fill:#10141a");
  });
});
