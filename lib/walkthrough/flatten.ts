import { StatementNode } from "@/lib/ir";

// Linearizes a method's statement tree into a flat, indented sequence of
// readable blocks for the Walkthrough ("Blocks") panel: each statement is a
// card, nested bodies are indented, and branch boundaries (else / case /
// catch) become labeled dividers.

export type WalkEntry =
  | { kind: "node"; node: StatementNode; depth: number }
  | { kind: "divider"; label: string; depth: number };

export function buildWalkthrough(nodes: StatementNode[], depth = 0): WalkEntry[] {
  const out: WalkEntry[] = [];
  for (const node of nodes) {
    out.push({ kind: "node", node, depth });

    if (node.type === "loop") {
      out.push(...buildWalkthrough(node.body, depth + 1));
    } else if (node.type === "if") {
      node.branches.forEach((branch, i) => {
        if (i > 0) {
          const label = !branch.condition || branch.condition === "else" ? "else" : `else if (${branch.condition})`;
          out.push({ kind: "divider", label, depth });
        }
        out.push(...buildWalkthrough(branch.body, depth + 1));
      });
    } else if (node.type === "switch") {
      for (const c of node.cases) {
        out.push({ kind: "divider", label: c.label, depth });
        out.push(...buildWalkthrough(c.body, depth + 1));
      }
    } else if (node.type === "try") {
      out.push(...buildWalkthrough(node.body, depth + 1));
      for (const c of node.catches) {
        out.push({ kind: "divider", label: `catch (${c.exceptionType})`, depth });
        out.push(...buildWalkthrough(c.body, depth + 1));
      }
    }
  }
  return out;
}
