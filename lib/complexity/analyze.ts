import { MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";

export type Confidence = "High" | "Medium" | "Low";

export type ComplexityResult = {
  time: { bigO: string; confidence: Confidence; explanation: string };
  space: { bigO: string; confidence: Confidence; explanation: string };
};

// Known library call costs. Call targets are receiver-qualified by the parser
// (e.g. "Arrays.sort"), so keys must be qualified the same way.
const CALL_COSTS: Record<string, { bigO: string; note: string }> = {
  "Arrays.sort": { bigO: "n log n", note: "Arrays.sort uses a dual-pivot quicksort/timsort hybrid" },
  "Collections.sort": { bigO: "n log n", note: "Collections.sort is a stable mergesort" },
  "List.sort": { bigO: "n log n", note: "List.sort is a stable mergesort" },
  "HashMap.get": { bigO: "1", note: "amortized O(1) hash lookup" },
  "HashMap.put": { bigO: "1", note: "amortized O(1) hash insert" },
  "HashMap.containsKey": { bigO: "1", note: "amortized O(1) hash lookup" },
  "HashSet.contains": { bigO: "1", note: "amortized O(1) hash lookup" },
  "HashSet.add": { bigO: "1", note: "amortized O(1) hash insert" },
  "ArrayList.add": { bigO: "1", note: "amortized O(1) append" },
  "ArrayList.get": { bigO: "1", note: "O(1) index access" },
  "PriorityQueue.add": { bigO: "log n", note: "heap insert" },
  "PriorityQueue.poll": { bigO: "log n", note: "heap extract-min" },
  "StringBuilder.append": { bigO: "1", note: "amortized O(1) append" },
  "String.charAt": { bigO: "1", note: "O(1) index access" },
};

const HALVING_ARG = /\/\s*2|>>\s*1|\bsubstring\s*\(/;
const HALVING_ASSIGNMENT = /=\s*[^;=]*(\/\s*2|>>\s*1)/;
const AUX_ALLOCATION =
  /new\s+\w+\s*\[|new\s+(ArrayList|LinkedList|HashMap|HashSet|TreeMap|TreeSet|ArrayDeque|PriorityQueue|StringBuilder|StringBuffer)\b/;

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

type CallHit = { line: number; target: string; args?: string; isRecursive: boolean };

function findAllCalls(method: MethodIR): CallHit[] {
  const hits: CallHit[] = [];
  function walk(nodes: StatementNode[]) {
    for (const node of nodes) {
      if (node.type === "call") {
        hits.push({ line: node.line, target: node.target, args: node.args, isRecursive: node.isRecursive });
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
  walk(method.body);
  return hits;
}

function collectStatements(body: StatementNode[]): StatementNode[] {
  const all: StatementNode[] = [];
  function walk(nodes: StatementNode[]) {
    for (const node of nodes) {
      all.push(node);
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
  return all;
}

function statementTexts(body: StatementNode[]): string[] {
  return collectStatements(body)
    .filter((n): n is Extract<StatementNode, { type: "statement" }> => n.type === "statement")
    .map((n) => n.text);
}

function hasHalvingAssignment(body: StatementNode[]): boolean {
  return statementTexts(body).some((t) => HALVING_ASSIGNMENT.test(t));
}

function hasAuxAllocation(body: StatementNode[]): { found: boolean; inLoop: boolean } {
  let inLoop = false;
  function walk(nodes: StatementNode[], insideLoop: boolean): boolean {
    let found = false;
    for (const node of nodes) {
      if (node.type === "statement" && AUX_ALLOCATION.test(node.text)) {
        found = true;
        if (insideLoop) inLoop = true;
      }
      if (node.type === "loop") found = walk(node.body, true) || found;
      if (node.type === "if") for (const b of node.branches) found = walk(b.body, insideLoop) || found;
      if (node.type === "switch") for (const c of node.cases) found = walk(c.body, insideLoop) || found;
      if (node.type === "try") {
        found = walk(node.body, insideLoop) || found;
        for (const c of node.catches) found = walk(c.body, insideLoop) || found;
      }
    }
    return found;
  }
  const found = walk(body, false);
  return { found, inLoop };
}

/** Detects the iterative binary-search signature: a loop whose body halves a variable. */
function findHalvingLoop(body: StatementNode[]): StatementNode | null {
  for (const node of body) {
    if (node.type === "loop" && hasHalvingAssignment(node.body)) return node;
  }
  return null;
}

function polynomialLabel(depth: number): string {
  if (depth === 0) return "1";
  if (depth === 1) return "n";
  if (depth === 2) return "n\u00B2";
  if (depth === 3) return "n\u00B3";
  return `n^${depth}`;
}

function findCallCosts(body: StatementNode[]): { bigO: string; note: string; line: number; target: string }[] {
  const hits: { bigO: string; note: string; line: number; target: string }[] = [];
  function walk(nodes: StatementNode[]) {
    for (const node of nodes) {
      if (node.type === "call" && CALL_COSTS[node.target]) {
        hits.push({ ...CALL_COSTS[node.target], line: node.line, target: node.target });
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
  const allCalls = findAllCalls(method);
  const recursiveCalls = allCalls.filter((c) => c.isRecursive);
  const helperCalls = allCalls.filter((c) => !c.isRecursive);
  const { depth, worstBound, ambiguousLines } = maxLoopDepth(method.body);
  const callCosts = findCallCosts(method.body);
  const halvingInArgs = recursiveCalls.some((c) => c.args && HALVING_ARG.test(c.args));
  const halvingAssignment = hasHalvingAssignment(method.body);
  const halvingLoop = findHalvingLoop(method.body);

  let timeBigO: string;
  let timeConfidence: Confidence;
  let timeExplanation: string;

  if (recursiveCalls.length > 0) {
    const callsInMethod = recursiveCalls.length;
    const callLines = recursiveCalls.map((c) => c.line).join(", ");
    if (callsInMethod >= 2) {
      if (halvingInArgs || halvingAssignment) {
        const perLevelWork = depth > 0 || helperCalls.length > 0;
        if (perLevelWork) {
          timeBigO = "O(n log n)";
          timeConfidence = "Medium";
          timeExplanation = `${callsInMethod} recursive calls (lines ${callLines}) on halved sub-ranges plus linear work per level (loop or helper call) — classic divide-and-conquer like merge sort.`;
        } else {
          timeBigO = "O(n)";
          timeConfidence = "Medium";
          timeExplanation = `${callsInMethod} recursive calls (lines ${callLines}) on halved sub-ranges with O(1) work per call — visits each element/node once, like a tree traversal.`;
        }
      } else {
        timeBigO = "2^n (branching recursion) — check for overlapping subproblems";
        timeConfidence = "Low";
        timeExplanation = `Method calls itself ${callsInMethod} times per invocation (lines ${callLines}) with no visible halving. Without memoization this is exponential; if the recursion actually halves the input each call (e.g. merge sort), this is really O(n log n) — verify manually.`;
      }
    } else {
      if (halvingInArgs || halvingAssignment) {
        timeBigO = "O(log n)";
        timeConfidence = "Medium";
        timeExplanation = `Single self-recursive call at line ${recursiveCalls[0].line} and the input is halved per call (recursion-tree depth is log n) — binary-search style recursion.`;
      } else {
        timeBigO = "n (linear recursion)";
        timeConfidence = depth > 0 ? "Medium" : "High";
        timeExplanation = `Single self-recursive call at line ${recursiveCalls[0].line}, depth of recursion scales with input size -> O(n) stack frames, O(n) work assuming O(1) per frame.`;
      }
    }
  } else if (halvingLoop && depth === 1) {
    timeBigO = "O(log n)";
    timeConfidence = "Medium";
    timeExplanation = `Loop at line ${halvingLoop.line} halves its range each iteration (assignment with /2 or >>1 inside the body) — iterative binary-search pattern.`;
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
    const costNote = callCosts
      .map((c) => `line ${c.line}: ${c.target} — ${c.note} (O(${c.bigO}))`)
      .join("; ");
    timeExplanation += ` Additional library calls: ${costNote}.`;
    const dominates = callCosts.some((c) => c.bigO === "n log n") && depth <= 1 && recursiveCalls.length === 0;
    if (dominates) {
      timeBigO = "O(n log n)";
      timeConfidence = timeConfidence === "Low" ? "Low" : "Medium";
      timeExplanation += ` Sorting dominates the overall complexity: ${timeBigO}.`;
    }
  }

  // Space: recursion stack depth dominates if present, otherwise look for evidence of
  // auxiliary structures sized by input (allocations of arrays/collections).
  let spaceBigO: string;
  let spaceConfidence: Confidence;
  let spaceExplanation: string;

  const aux = hasAuxAllocation(method.body);

  if (recursiveCalls.length > 0) {
    if (halvingInArgs || halvingAssignment) {
      spaceBigO = "O(log n)";
      spaceConfidence = "Medium";
      spaceExplanation = "Recursion halves the input each call, so stack depth is O(log n).";
    } else {
      spaceBigO = "O(n)";
      spaceConfidence = "Medium";
      spaceExplanation = "Recursive calls consume stack frames proportional to recursion depth (assumed O(n) unless the recursion provably halves each call).";
    }
  } else if (aux.found) {
    spaceBigO = "O(n)";
    spaceConfidence = aux.inLoop ? "Medium" : "Medium";
    spaceExplanation = aux.inLoop
      ? "An auxiliary array/collection is allocated inside a loop — grows with the input."
      : "An auxiliary array/collection is allocated — assume it grows with the input unless it is fixed-size.";
  } else if (depth > 0) {
    spaceBigO = "O(1)";
    spaceConfidence = "Low";
    spaceExplanation = "Loops detected but no auxiliary allocation found in statement text — likely in-place, but verify manually.";
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
