import { MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";

export type Confidence = "High" | "Medium" | "Low";

export type ComplexityResult = {
  time: { bigO: string; confidence: Confidence; explanation: string };
  space: { bigO: string; confidence: Confidence; explanation: string };
};

// Known library call costs. Extend this table as you run into more DSA-relevant calls.
const CALL_COSTS: Record<string, { bigO: string; note: string }> = {
  "Arrays.sort": { bigO: "n log n", note: "Arrays.sort uses a dual-pivot quicksort/timsort hybrid" },
  "Collections.sort": { bigO: "n log n", note: "Collections.sort is a stable mergesort" },
  "HashMap.get": { bigO: "1", note: "amortized O(1) hash lookup" },
  "HashMap.put": { bigO: "1", note: "amortized O(1) hash insert" },
  "HashSet.contains": { bigO: "1", note: "amortized O(1) hash lookup" },
  "ArrayList.add": { bigO: "1", note: "amortized O(1) append" },
  "ArrayList.get": { bigO: "1", note: "O(1) index access" },
  "PriorityQueue.add": { bigO: "log n", note: "heap insert" },
  "PriorityQueue.poll": { bigO: "log n", note: "heap extract-min" },
};

function maxLoopDepth(body: StatementNode[]): { depth: number; worstBound: LoopBoundType; ambiguousLines: number[] } {
  let depth = 0;
  let worstBound: LoopBoundType = "constant";
  const ambiguousLines: number[] = [];

  const boundRank: Record<LoopBoundType, number> = {
    constant: 0,
    parameter: 1,
    "input-dependent": 2,
    unknown: 3,
  };

  function walk(nodes: StatementNode[], currentDepth: number) {
    for (const node of nodes) {
      if (node.type === "loop") {
        const nextDepth = currentDepth + 1;
        depth = Math.max(depth, nextDepth);
        if (boundRank[node.boundType] > boundRank[worstBound]) worstBound = node.boundType;
        if (node.boundType === "input-dependent" || node.boundType === "unknown") {
          ambiguousLines.push(node.line);
        }
        walk(node.body, nextDepth);
      } else if (node.type === "if") {
        for (const branch of node.branches) walk(branch.body, currentDepth);
      } else if (node.type === "switch") {
        for (const c of node.cases) walk(c.body, currentDepth);
      } else if (node.type === "try") {
        walk(node.body, currentDepth);
        for (const c of node.catches) walk(c.body, currentDepth);
      }
    }
  }

  walk(body, 0);
  return { depth, worstBound, ambiguousLines };
}

function findRecursiveCalls(method: MethodIR): { line: number; target: string }[] {
  const hits: { line: number; target: string }[] = [];
  function walk(nodes: StatementNode[]) {
    for (const node of nodes) {
      if (node.type === "call" && node.isRecursive) hits.push({ line: node.line, target: node.target });
      if (node.type === "loop") walk(node.body);
      if (node.type === "if") for (const b of node.branches) walk(b.body);
      if (node.type === "switch") for (const c of node.cases) walk(c.body);
      if (node.type === "try") {
        walk(node.body);
        for (const c of node.catches) walk(c.body);
      }
    }
  }
  walk(method.body);
  return hits;
}

function polynomialLabel(depth: number): string {
  if (depth === 0) return "1";
  if (depth === 1) return "n";
  if (depth === 2) return "n\u00B2";
  if (depth === 3) return "n\u00B3";
  return `n^${depth}`;
}

function findCallCosts(body: StatementNode[]): { bigO: string; note: string; line: number }[] {
  const hits: { bigO: string; note: string; line: number }[] = [];
  function walk(nodes: StatementNode[]) {
    for (const node of nodes) {
      if (node.type === "call" && CALL_COSTS[node.target]) {
        hits.push({ ...CALL_COSTS[node.target], line: node.line });
      }
      if (node.type === "loop") walk(node.body);
      if (node.type === "if") for (const b of node.branches) walk(b.body);
      if (node.type === "switch") for (const c of node.cases) walk(c.body);
      if (node.type === "try") {
        walk(node.body);
        for (const c of node.catches) walk(c.body);
      }
    }
  }
  walk(body);
  return hits;
}

/**
 * Estimates time/space complexity for a single method using structural heuristics.
 * This is intentionally NOT a formal proof — general complexity analysis is
 * undecidable for arbitrary programs. We surface reasoning + confidence instead
 * of a bare label so the estimate can be sanity-checked (good interview practice too).
 */
export function analyzeComplexity(method: MethodIR): ComplexityResult {
  const recursiveCalls = findRecursiveCalls(method);
  const { depth, worstBound, ambiguousLines } = maxLoopDepth(method.body);
  const callCosts = findCallCosts(method.body);

  let timeBigO: string;
  let timeConfidence: Confidence;
  let timeExplanation: string;

  if (recursiveCalls.length > 0) {
    // Heuristic: single self-recursive call with no evidence of halving input -> assume linear recursion O(n).
    // Two recursive calls in the same method body is the classic divide-and-conquer signature -> O(n log n)
    // if paired with a loop/linear scan per call, else flag as exponential (unresolved subproblem overlap).
    const callsInMethod = recursiveCalls.length;
    if (callsInMethod >= 2) {
      timeBigO = "2^n (branching recursion) — check for overlapping subproblems";
      timeConfidence = "Low";
      timeExplanation = `Method calls itself ${callsInMethod} times per invocation (lines ${recursiveCalls
        .map((c) => c.line)
        .join(", ")}). Without memoization this is exponential; if the recursion actually halves the input each call (e.g. merge sort), this is really O(n log n) — verify manually.`;
    } else {
      timeBigO = "n (linear recursion)";
      timeConfidence = depth > 0 ? "Medium" : "High";
      timeExplanation = `Single self-recursive call at line ${recursiveCalls[0].line}, depth of recursion scales with input size -> O(n) stack frames, O(n) work assuming O(1) per frame.`;
    }
  } else if (depth > 0) {
    timeBigO = `O(${polynomialLabel(depth)})`;
    timeConfidence = worstBound === "constant" || worstBound === "parameter" ? "High" : worstBound === "input-dependent" ? "Medium" : "Low";
    timeExplanation = `Max loop nesting depth is ${depth}, giving a base of O(${polynomialLabel(depth)}).`;
    if (ambiguousLines.length > 0) {
      timeExplanation += ` Bound at line${ambiguousLines.length > 1 ? "s" : ""} ${ambiguousLines.join(
        ", "
      )} is data/input-dependent rather than a fixed parameter — worst case assumed, but actual runtime could be smaller depending on input.`;
    }
  } else {
    timeBigO = "O(1)";
    timeConfidence = "High";
    timeExplanation = "No loops or recursion detected — constant time relative to input size.";
  }

  if (callCosts.length > 0) {
    const costNote = callCosts.map((c) => `line ${c.line}: ${c.note} (O(${c.bigO}))`).join("; ");
    timeExplanation += ` Additional library calls: ${costNote}.`;
  }

  // Space: recursion stack depth dominates if present, otherwise look for evidence of
  // auxiliary structures sized by input (approximated here by loop depth as a proxy
  // for "obviously O(n) space" patterns like building an array/list inside a loop).
  let spaceBigO: string;
  let spaceConfidence: Confidence;
  let spaceExplanation: string;

  if (recursiveCalls.length > 0) {
    spaceBigO = "O(n)";
    spaceConfidence = "Medium";
    spaceExplanation = "Recursive calls consume stack frames proportional to recursion depth (assumed O(n) unless the recursion provably halves each call).";
  } else if (depth > 0) {
    spaceBigO = "O(1) or O(n) — depends on whether the loop builds an auxiliary structure";
    spaceConfidence = "Low";
    spaceExplanation = "Loop(s) detected but auxiliary space depends on whether they allocate a growing data structure (array/list/map) vs. operating in place. Check manually.";
  } else {
    spaceBigO = "O(1)";
    spaceConfidence = "High";
    spaceExplanation = "No loops or recursion — no evidence of input-scaled auxiliary space.";
  }

  return {
    time: { bigO: timeBigO, confidence: timeConfidence, explanation: timeExplanation },
    space: { bigO: spaceBigO, confidence: spaceConfidence, explanation: spaceExplanation },
  };
}
