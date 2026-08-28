import { MethodIR, StatementNode } from "@/lib/ir";
import { CALL_COSTS, hasHalvingAssignment, hasAuxAllocation } from "./analyze";

// Per-block complexity: annotates each "major block" (every loop and every
// function/method call) with its own time and space cost, so a reader can see
// where the overall complexity comes from instead of only the method-level sum.

export type BlockComplexity = {
  line: number;
  kind: "loop" | "call";
  label: string;
  time: string;
  space: string;
  note: string;
};

type LoopNode = Extract<StatementNode, { type: "loop" }>;
type CallNode = Extract<StatementNode, { type: "call" }>;

function loopIterations(node: LoopNode): { bigO: string; note: string } {
  if (hasHalvingAssignment(node.body)) {
    return { bigO: "O(log n)", note: "halves its range each iteration (binary-search pattern)" };
  }
  switch (node.boundType) {
    case "constant":
      return { bigO: "O(1)", note: "runs a fixed number of iterations" };
    case "parameter":
      return { bigO: "O(n)", note: "iteration count bounded by a method parameter" };
    case "input-dependent":
      return { bigO: "O(n)", note: "iteration count scales with the input size (worst case)" };
    default:
      return { bigO: "O(?)", note: "iteration bound is unclear — verify manually" };
  }
}

function loopLabel(node: LoopNode): string {
  const cond = node.condition ? ` ${node.condition}` : "";
  return node.kind === "do-while" ? `do…while${cond}` : `${node.kind}${cond}`;
}

function sortSpace(target: string): string {
  // Sorting needs extra space: TimSort (objects) is O(n), in-place quicksort
  // variants (primitives) are O(log n) stack. We report the conservative O(n).
  return /\.sort$/.test(target) ? "O(n)" : "O(1)";
}

export function analyzeBlockComplexity(method: MethodIR): BlockComplexity[] {
  const out: BlockComplexity[] = [];

  function walk(nodes: StatementNode[]) {
    for (const node of nodes) {
      if (node.type === "loop") {
        const it = loopIterations(node);
        const aux = hasAuxAllocation(node.body);
        const spaceNote = aux.found
          ? aux.inLoop
            ? "allocates a collection inside the loop — extra space grows with the input"
            : "allocates an auxiliary collection"
          : "in-place — no extra allocation in the body";
        out.push({
          line: node.line,
          kind: "loop",
          label: loopLabel(node),
          time: it.bigO,
          space: aux.found ? "O(n)" : "O(1)",
          note: `${it.note}; ${spaceNote}.`,
        });
        walk(node.body);
      } else if (node.type === "call") {
        out.push(callEntry(node));
      } else if (node.type === "if") {
        for (const b of node.branches) walk(b.body);
      } else if (node.type === "switch") {
        for (const c of node.cases) walk(c.body);
      } else if (node.type === "try") {
        walk(node.body);
        for (const c of node.catches) walk(c.body);
      }
    }
  }

  walk(method.body);
  return out;
}

function callEntry(node: CallNode): BlockComplexity {
  const label = `${node.target}(${node.args ?? ""})`;
  const known = CALL_COSTS[node.target];
  if (known) {
    return {
      line: node.line,
      kind: "call",
      label,
      time: `O(${known.bigO})`,
      space: sortSpace(node.target),
      note: known.note,
    };
  }
  if (node.isRecursive) {
    return {
      line: node.line,
      kind: "call",
      label,
      time: "recursive",
      space: "O(depth)",
      note: "self-recursive call — cost depends on recursion depth (see method-level analysis).",
    };
  }
  return {
    line: node.line,
    kind: "call",
    label,
    time: "O(?)",
    space: "O(1)",
    note: "user-defined or external call — cost depends on that method's implementation.",
  };
}
