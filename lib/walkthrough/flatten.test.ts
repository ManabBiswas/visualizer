import { describe, it, expect } from "vitest";
import { buildWalkthrough } from "./flatten";
import { StatementNode } from "@/lib/ir";

describe("buildWalkthrough", () => {
  it("flattens nested loops with increasing depth", () => {
    const nodes: StatementNode[] = [
      {
        type: "loop",
        kind: "for",
        line: 1,
        endLine: 5,
        boundType: "input-dependent",
        condition: "i < n",
        body: [
          { type: "statement", line: 2, text: "x++;" },
          {
            type: "loop",
            kind: "for",
            line: 3,
            endLine: 4,
            boundType: "constant",
            condition: "j < 10",
            body: [{ type: "call", line: 4, target: "g", args: "j", isRecursive: false }],
          },
        ],
      },
    ];
    const entries = buildWalkthrough(nodes);
    expect(entries.map((e) => e.kind)).toEqual(["node", "node", "node", "node"]);
    expect(entries.map((e) => e.depth)).toEqual([0, 1, 1, 2]);
  });

  it("emits dividers for else branches, switch cases and catches", () => {
    const nodes: StatementNode[] = [
      {
        type: "if",
        line: 1,
        branches: [
          { condition: "n <= 1", body: [{ type: "return", line: 2, value: "n" }] },
          { condition: "else", body: [{ type: "return", line: 4, value: "0" }] },
        ],
      },
      {
        type: "switch",
        line: 6,
        cases: [
          { label: "case 1", body: [{ type: "statement", line: 7, text: "break;" }] },
          { label: "default", body: [] },
        ],
      },
      {
        type: "try",
        line: 10,
        body: [{ type: "call", line: 11, target: "g", isRecursive: false }],
        catches: [{ exceptionType: "Exception", body: [{ type: "statement", line: 13, text: "log();" }] }],
      },
    ];
    const entries = buildWalkthrough(nodes);
    const dividers = entries.filter((e) => e.kind === "divider") as Extract<(typeof entries)[number], { kind: "divider" }>[];
    expect(dividers.map((d) => d.label)).toEqual(["else", "case 1", "default", "catch (Exception)"]);
    // body after each divider is indented one level deeper
    const elseIdx = entries.findIndex((e) => e.kind === "divider" && e.label === "else");
    expect(entries[elseIdx + 1].depth).toBe(1);
  });

  it("returns an empty list for empty bodies", () => {
    expect(buildWalkthrough([])).toEqual([]);
  });
});
