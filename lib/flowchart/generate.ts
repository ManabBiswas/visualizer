import { MethodIR, ProgramIR, StatementNode, CommentTag } from "@/lib/ir";
import type { Theme } from "@/lib/theme";

type Edge = { from: string; to: string; label?: string; dotted?: boolean };
type NodeDef = {
  id: string;
  shape: "rect" | "diamond" | "stadium" | "subroutine" | "round";
  text: string;
  line: number;
  cssClass: string;
};
type EmittedNode = { id: string; line: number; endLine: number };

export type LegendEntry = { label: string; color: string; description: string };

export const FLOWCHART_LEGEND: LegendEntry[] = [
  { label: "Start / End", color: "#8b949e", description: "Method entry and exit" },
  { label: "Entry point", color: "#238636", description: "Method with no inbound calls (whole-program view only) — execution starts here" },
  { label: "Statement", color: "#38bdf8", description: "Assignment, declaration, other code" },
  { label: "Decision", color: "#ffc176", description: "if / switch branch points" },
  { label: "Loop", color: "#d2a8ff", description: "for / while / do-while" },
  { label: "Method call", color: "#79c0ff", description: "Call to another method" },
  { label: "Recursive call", color: "#f85149", description: "Method calling itself" },
  { label: "Return", color: "#238636", description: "Return with value" },
  { label: "External call", color: "#8b949e", description: "Library call shared across methods (whole-program view only)" },
  { label: "q / note / why / complexity", color: "#ffa657", description: "Your tagged comments, attached to the code they annotate" },
];

const CLASS_DEFS: Record<Theme, string> = {
  dark: `
classDef startNode fill:#1c2026,stroke:#8b949e,stroke-width:1px,color:#dfe2eb,font-weight:bold
classDef entryNode fill:#1c2026,stroke:#238636,stroke-width:2px,color:#dfe2eb,font-weight:bold
classDef endNode fill:#1c2026,stroke:#238636,stroke-width:1px,color:#dfe2eb
classDef process fill:#10141a,stroke:#38bdf8,stroke-width:1px,color:#dfe2eb
classDef decision fill:#10141a,stroke:#ffc176,stroke-width:1px,color:#dfe2eb
classDef loopNode fill:#10141a,stroke:#d2a8ff,stroke-width:1px,color:#dfe2eb
classDef callNode fill:#10141a,stroke:#79c0ff,stroke-width:1px,color:#dfe2eb,font-weight:bold
classDef recursion fill:#161b22,stroke:#f85149,stroke-width:2px,color:#dfe2eb,font-weight:bold
classDef returnNode fill:#1c2026,stroke:#238636,stroke-width:1px,color:#dfe2eb
classDef tryNode fill:#10141a,stroke:#8b949e,stroke-width:1px,color:#8b949e
classDef external fill:#1c2026,stroke:#3e484f,stroke-width:1px,color:#8b949e,stroke-dasharray:3 3
classDef noteQ fill:#262a31,stroke:#8ed5ff,stroke-dasharray:4 3,color:#dfe2eb
classDef noteNote fill:#262a31,stroke:#79c0ff,stroke-dasharray:4 3,color:#dfe2eb
classDef noteWhy fill:#262a31,stroke:#d2a8ff,stroke-dasharray:4 3,color:#dfe2eb
classDef noteComplexity fill:#262a31,stroke:#ffa657,stroke-dasharray:4 3,color:#dfe2eb
`.trim(),
  light: `
classDef startNode fill:#f6f8fa,stroke:#6e7781,stroke-width:1px,color:#1f2328,font-weight:bold
classDef entryNode fill:#f6f8fa,stroke:#1a7f37,stroke-width:2px,color:#1f2328,font-weight:bold
classDef endNode fill:#f6f8fa,stroke:#1a7f37,stroke-width:1px,color:#1f2328
classDef process fill:#ffffff,stroke:#0969da,stroke-width:1px,color:#1f2328
classDef decision fill:#ffffff,stroke:#bc4c00,stroke-width:1px,color:#1f2328
classDef loopNode fill:#ffffff,stroke:#8250df,stroke-width:1px,color:#1f2328
classDef callNode fill:#ffffff,stroke:#0969da,stroke-width:1px,color:#1f2328,font-weight:bold
classDef recursion fill:#fff1f0,stroke:#d1242f,stroke-width:2px,color:#1f2328,font-weight:bold
classDef returnNode fill:#f6f8fa,stroke:#1a7f37,stroke-width:1px,color:#1f2328
classDef tryNode fill:#ffffff,stroke:#6e7781,stroke-width:1px,color:#57606a
classDef external fill:#f6f8fa,stroke:#d0d7de,stroke-width:1px,color:#6e7781,stroke-dasharray:3 3
classDef noteQ fill:#f6f8fa,stroke:#0969da,stroke-dasharray:4 3,color:#1f2328
classDef noteNote fill:#f6f8fa,stroke:#0969da,stroke-dasharray:4 3,color:#1f2328
classDef noteWhy fill:#f6f8fa,stroke:#8250df,stroke-dasharray:4 3,color:#1f2328
classDef noteComplexity fill:#f6f8fa,stroke:#bc4c00,stroke-dasharray:4 3,color:#1f2328
`.trim(),
};

const NOTE_CLASS: Record<CommentTag["tag"], string> = {
  q: "noteQ",
  note: "noteNote",
  why: "noteWhy",
  complexity: "noteComplexity",
};

export function escapeLabel(text: string): string {
  return text
    .replace(/&/g, "#amp;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/`/g, "'");
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function nodeEndLine(node: StatementNode): number {
  if (node.type === "loop") return node.endLine;
  const childEnds: number[] = [];
  if (node.type === "if") {
    for (const b of node.branches) {
      childEnds.push(...b.body.map(nodeEndLine));
    }
  } else if (node.type === "switch") {
    for (const c of node.cases) childEnds.push(...c.body.map(nodeEndLine));
  } else if (node.type === "try") {
    childEnds.push(...node.body.map(nodeEndLine));
    for (const c of node.catches) childEnds.push(...c.body.map(nodeEndLine));
  }
  return childEnds.length > 0 ? Math.max(node.line, ...childEnds) : node.line;
}

export type FlowchartWithTooltips = {
  /** Mermaid flowchart syntax (unchanged — tooltips travel separately). */
  diagram: string;
  /**
   * Mermaid node id -> full untruncated tooltip text. The panels inject these
   * as native SVG <title> elements via the DOM API after rendering, so the
   * text never passes through the mermaid parser (XSS-safe by construction).
   */
  tooltips: Map<string, string>;
  /**
   * Source line -> mermaid node id. The editor's cursor highlight uses this
   * to find which SVG group to pulse when the user is parked on a line.
   * Lines without a node (e.g. blank lines, comments-only lines) are absent.
   */
  nodeByLine: Map<number, string>;
};

/**
 * Converts a method's statement tree into Mermaid flowchart syntax.
 *
 * Format: code-centric labels (conditions, statements, call targets with args),
 * node colors per construct (see FLOWCHART_LEGEND / CLASS_DEFS), and the method's
 * tagged comments (// q:, // note:, // why:, // complexity:) rendered as dashed
 * note nodes attached to the statement they annotate.
 *
 * Each node gets a `click` binding wired to a global `onFlowchartNodeClick(line)`
 * handler (registered by the frontend) so clicking a node highlights the
 * corresponding source line in the editor (see DESIGN.md 3.2).
 *
 * Full untruncated node text is returned in `tooltips` for the panels to
 * inject as hover tooltips.
 */
export function generateFlowchartWithTooltips(
  method: MethodIR,
  theme: Theme = "dark"
): FlowchartWithTooltips {
  let idCounter = 0;
  const nextId = (): string => {
    idCounter += 1;
    return `n${idCounter}`;
  };

  const nodes: NodeDef[] = [];
  const edges: Edge[] = [];
  const emitted: EmittedNode[] = [];
  const tooltips = new Map<string, string>();
  const nodeByLine = new Map<number, string>();

  function addNode(
    shape: NodeDef["shape"],
    text: string,
    line: number,
    cssClass: string,
    endLine?: number,
    tooltip?: string
  ): string {
    const id = nextId();
    nodes.push({ id, shape, text, line, cssClass });
    emitted.push({ id, line, endLine: endLine ?? line });
    if (tooltip) tooltips.set(id, tooltip);
    return id;
  }

  const paramList = method.params.map((p) => p.name).join(", ");
  const startId = addNode(
    "stadium",
    `▶ ${method.name}(${truncate(paramList, 24)})`,
    method.startLine,
    "startNode"
  );

  const endId = walk(method.body, startId);

  const finalId = addNode("stadium", "End", method.endLine, "endNode");
  edges.push({ from: endId, to: finalId });

  function walk(body: StatementNode[], entryId: string): string {
    let current = entryId;
    for (const stmt of body) {
      current = emit(stmt, current);
    }
    return current;
  }

  function emit(stmt: StatementNode, entryId: string): string {
    switch (stmt.type) {
      case "loop": {
        const condition = stmt.condition ? ` ${truncate(stmt.condition, 40)}` : "";
        const loopId = addNode(
          "diamond",
          `${stmt.kind}${condition} · L${stmt.line}`,
          stmt.line,
          "loopNode",
          stmt.endLine,
          stmt.condition ? `${stmt.kind} (while ${stmt.condition} is true) — lines ${stmt.line}-${stmt.endLine}` : `${stmt.kind} loop — lines ${stmt.line}-${stmt.endLine}`
        );
        edges.push({ from: entryId, to: loopId });
        const bodyExit = walk(stmt.body, loopId);
        if (bodyExit !== loopId) edges.push({ from: bodyExit, to: loopId, label: "repeat" });
        return loopId;
      }
      case "if": {
        const firstCondition = stmt.branches.find((b) => b.condition)?.condition ?? "";
        const ifId = addNode(
          "diamond",
          `if ${truncate(firstCondition, 40)} · L${stmt.line}`,
          stmt.line,
          "decision",
          nodeEndLine(stmt),
          stmt.branches
            .filter((b) => b.condition)
            .map((b) => `if ${b.condition}`)
            .join("; ") || `if — line ${stmt.line}`
        );
        edges.push({ from: entryId, to: ifId });
        const joinId = addNode("rect", "merge", stmt.line, "process");
        for (const branch of stmt.branches) {
          const branchExit = walk(branch.body, ifId);
          edges.push({ from: branchExit, to: joinId, label: branch.isElse ? "else" : "true" });
        }
        return joinId;
      }
      case "switch": {
        const switchId = addNode(
          "diamond",
          `switch · L${stmt.line}`,
          stmt.line,
          "decision",
          nodeEndLine(stmt)
        );
        edges.push({ from: entryId, to: switchId });
        const joinId = addNode("rect", "merge", stmt.line, "process");
        for (const c of stmt.cases) {
          const caseExit = walk(c.body, switchId);
          edges.push({ from: caseExit, to: joinId, label: truncate(c.label, 16) });
        }
        return joinId;
      }
      case "try": {
        const tryId = addNode("rect", `try · L${stmt.line}`, stmt.line, "tryNode", nodeEndLine(stmt));
        edges.push({ from: entryId, to: tryId });
        const joinId = addNode("rect", "merge", stmt.line, "process");
        const tryExit = walk(stmt.body, tryId);
        edges.push({ from: tryExit, to: joinId });
        for (const c of stmt.catches) {
          const catchId = addNode("rect", `catch ${truncate(c.exceptionType, 24)}`, stmt.line, "tryNode");
          edges.push({ from: tryId, to: catchId, label: "exception" });
          const catchExit = walk(c.body, catchId);
          edges.push({ from: catchExit, to: joinId });
        }
        return joinId;
      }
      case "call": {
        const args = stmt.args ? `(${truncate(stmt.args, 28)})` : "()";
        const callId = addNode(
          "subroutine",
          `${truncate(stmt.target, 24)}${args} · L${stmt.line}`,
          stmt.line,
          stmt.isRecursive ? "recursion" : "callNode",
          undefined,
          `${stmt.target}(${stmt.args ?? ""})${stmt.isRecursive ? " — recursive call" : ""}`
        );
        edges.push({ from: entryId, to: callId });
        return callId;
      }
      case "return": {
        const value = stmt.value ? ` ${truncate(stmt.value, 32)}` : "";
        const retId = addNode(
          "stadium",
          `return${value} · L${stmt.line}`,
          stmt.line,
          "returnNode",
          undefined,
          stmt.value ? `return ${stmt.value}` : "return"
        );
        edges.push({ from: entryId, to: retId });
        return retId;
      }
      default: {
        const stmtId = addNode(
          "rect",
          `${truncate(stmt.text, 44)} · L${stmt.line}`,
          stmt.line,
          "process",
          undefined,
          stmt.text
        );
        edges.push({ from: entryId, to: stmtId });
        return stmtId;
      }
    }
  }

  attachCommentNotes(method.comments ?? [], finalId);

  /**
   * Attaches each tagged comment to the deepest statement whose line range
   * contains it (inline/trailing comments), or to the next statement after it
   * (comments written above a line of code), then renders it as a dashed note node.
   */
  function attachCommentNotes(tags: CommentTag[], fallbackId: string) {
    for (const tag of tags) {
      let ownerId: string | null = null;
      for (const e of emitted) {
        if (e.line <= tag.line && tag.line <= e.endLine) ownerId = e.id;
      }
      if (!ownerId) {
        const next = emitted.find((e) => e.line > tag.line);
        ownerId = next ? next.id : fallbackId;
      }
      const noteId = nextId();
      nodes.push({
        id: noteId,
        shape: "round",
        text: `[${tag.tag}] ${truncate(tag.text, 64)} · L${tag.line}`,
        line: tag.line,
        cssClass: NOTE_CLASS[tag.tag],
      });
      tooltips.set(noteId, `// ${tag.tag}: ${tag.text}`);
      edges.push({ from: ownerId, to: noteId, dotted: true });
    }
  }

    for (const node of nodes) {
      // Source-line → mermaid node id. The editor's cursor highlight uses this
      // to find which SVG group to pulse when the user is parked on a line.
      nodeByLine.set(node.line, node.id);
    }
    const lines: string[] = ["flowchart TD"];
    for (const node of nodes) {
      lines.push(`  ${node.id}${shapeSyntax(node.shape, node.text)}:::${node.cssClass}`);
      lines.push(`  click ${node.id} call onFlowchartNodeClick("${node.line}")`);
    }
  for (const edge of edges) {
    const arrow = edge.dotted ? "-.->" : edge.label ? `-- ${edge.label} -->` : "-->";
    lines.push(`  ${edge.from} ${arrow} ${edge.to}`);
  }
  lines.push(CLASS_DEFS[theme].split("\n").map((l) => `  ${l}`).join("\n"));

  return { diagram: lines.join("\n"), tooltips, nodeByLine };
}

/**
 * Back-compat wrapper: diagram text only. Kept for exports/tests that don't
 * show tooltips (SVG downloads, PDF reports).
 */
export function generateFlowchart(method: MethodIR, theme: Theme = "dark"): string {
  return generateFlowchartWithTooltips(method, theme).diagram;
}

function shapeSyntax(shape: NodeDef["shape"], text: string): string {
  const escaped = escapeLabel(text);
  switch (shape) {
    case "diamond":
      return `{"${escaped}"}`;
    case "stadium":
      return `(["${escaped}"])`;
    case "subroutine":
      return `[["${escaped}"]]`;
    case "round":
      return `("${escaped}")`;
    default:
      return `["${escaped}"]`;
  }
}

// Python stdlib modules whose lowercase receivers are still library calls
// (e.g. heapq.heappush) — same list the call graph uses, so the whole-program
// and the dedicated call graph agree on what counts as "external".
const PYTHON_STDLIB_MODULES = new Set([
  "heapq",
  "bisect",
  "collections",
  "itertools",
  "functools",
  "math",
  "cmath",
  "random",
  "re",
  "string",
  "array",
  "queue",
  "struct",
  "textwrap",
  "operator",
]);

function isLibraryCall(call: string): boolean {
  if (/^[A-Z]\w*\./.test(call)) return true; // Java/C#: Arrays.sort
  const receiver = call.includes(".") ? call.split(".")[0] : "";
  return PYTHON_STDLIB_MODULES.has(receiver); // Python: heapq.heappush
}

/**
 * Ranks methods by call depth (BFS from entry points) so Mermaid's dagre
 * layout emits "entry on top, callees below". Incoming-edge counts are not
 * enough: a chain A→B→C has incoming=1 for both B and C, so counting alone
 * would place B and C on the same rank and scatter them side-by-side.
 * Stable: methods at the same depth keep the parser's declaration order.
 */
function topoSortMethods(
  methods: MethodIR[],
  _definedByName: Map<string, { className: string; method: MethodIR }>
): MethodIR[] {
  const byName = new Map<string, MethodIR>();
  for (const m of methods) byName.set(m.name, m);

  // Children: which defined methods does this method call?
  const children = new Map<string, string[]>();
  const inbound = new Set<string>();
  for (const m of methods) {
    const kids: string[] = [];
    for (const call of m.calls ?? []) {
      const simple = call.includes(".") ? call.split(".").pop()! : call;
      if (simple !== m.name && byName.has(simple)) {
        kids.push(simple);
        inbound.add(simple);
      }
    }
    children.set(m.name, kids);
  }

  // BFS depth from entry points (no inbound edges). Methods never reached
  // (mutually recursive SCCs with no entry) get Infinity and sink to the end.
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const m of methods) {
    if (!inbound.has(m.name)) {
      depth.set(m.name, 0);
      queue.push(m.name);
    }
  }
  while (queue.length > 0) {
    const name = queue.shift()!;
    const d = depth.get(name)!;
    for (const kid of children.get(name) ?? []) {
      if (!depth.has(kid)) {
        depth.set(kid, d + 1);
        queue.push(kid);
      }
    }
  }

  return methods
    .map((m, i) => ({ m, i, d: depth.get(m.name) ?? Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.d - b.d) || (a.i - b.i))
    .map((x) => x.m);
}

export type WholeProgramNode = {
  /** Stable id within the whole-program diagram — `${classId}-${methodId}-n${n}`. */
  id: string;
  line: number;
  endLine: number;
};

export type WholeProgramFlowchart = {
  /** Mermaid `flowchart` source. */
  diagram: string;
  /** Mermaid node id -> full untruncated tooltip text. */
  tooltips: Map<string, string>;
  /**
   * Method id (m-prefixed, used as the click target for method headers) and the
   * source line that should become active in the editor when it is clicked.
   * The panel uses this to wire the "switch to that method" handler.
   */
  methods: Map<string, { methodName: string; className: string; line: number }>;
};

/**
 * Builds a single unified flowchart for the whole program: every class becomes
 * a Mermaid `subgraph`, every method is a nested subgraph inside it, and
 * cross-method calls render as arrows spanning the subgraphs. External library
 * calls (Java: `Arrays.sort`, Python: `heapq.heappush`) get a shared pool of
 * dimmed leaf nodes outside any class, so the diagram stays compact even when
 * the same library is hit from many methods.
 *
 * Click targets:
 *   - statement/call/decision nodes: `onFlowchartNodeClick(line)` — jump to the
 *     source line in the editor (the line number is the original source line,
 *     not the per-method offset)
 *   - method header nodes: `onWholeProgramMethodClick(methodName)` — switch
 *     the panel to that method's individual flowchart
 *
 * Language-agnostic: works for Java, Python, C++, and C — all of those
 * produce the same ProgramIR shape downstream of the parser.
 */
export function generateWholeProgramFlowchart(
  ir: ProgramIR,
  theme: Theme = "dark"
): WholeProgramFlowchart {
  const tooltips = new Map<string, string>();
  const methods = new Map<string, { methodName: string; className: string; line: number }>();
  // Tighter ranks in the whole-program view: methods that call each other
  // should sit close vertically so the cross-method path reads as one flow,
  // not three isolated boxes with long arrows between them.
  const lines: string[] = [
    "%%{init: {\"flowchart\": {\"rankSpacing\": 28, \"nodeSpacing\": 24}}}%%",
    "flowchart TD",
  ];
  // Mermaid `linkStyle` only accepts numeric edge indices (order of edge
  // declarations), so every edge goes through pushEdge to keep the counter
  // accurate; cross-method call edges record their index for bold styling.
  let edgeCount = 0;
  const crossEdgeIndices: number[] = [];
  const pushEdge = (edgeLine: string): void => {
    edgeCount += 1;
    lines.push(edgeLine);
  };
  const pushCrossEdge = (edgeLine: string): void => {
    crossEdgeIndices.push(edgeCount);
    edgeCount += 1;
    lines.push(edgeLine);
  };

  // Index defined methods by name so cross-method edges can resolve to their
  // internal subgraph. Methods are unique by name within a program (the parser
  // already handles overloading by disambiguating names), so a flat map is fine.
  const definedByName = new Map<string, { className: string; method: MethodIR }>();
  for (const cls of ir.classes ?? []) {
    for (const method of cls.methods ?? []) {
      if (!definedByName.has(method.name)) {
        definedByName.set(method.name, { className: cls.name, method });
      }
    }
  }

  // Entry-point detection: a method is an entry point if no other method in
  // the program calls it. The common conventions ("main", "if __name__")
  // are too brittle to rely on, so we infer from the call graph instead —
  // this works for Java/Python/C++/C uniformly. Methods with no inbound
  // edges get a green-bordered header so the user can see where execution
  // starts.
  const calledBy = new Set<string>();
  for (const cls of ir.classes ?? []) {
    for (const method of cls.methods ?? []) {
      for (const call of method.calls ?? []) {
        const simpleName = call.includes(".") ? call.split(".").pop()! : call;
        calledBy.add(simpleName);
      }
    }
  }
  const isEntryPoint = (name: string): boolean => !calledBy.has(name);

  // Shared external-call pool: each unique qualified library name becomes one
  // dimmed leaf node. Defined once, referenced from every method that uses it.
  const externals = new Map<string, string>();
  function externalId(call: string): string {
    let id = externals.get(call);
    if (id) return id;
    id = `ext${externals.size + 1}`;
    externals.set(call, id);
    return id;
  }

  // Each method's nodes are prefixed with `${classId}-${methodId}-` so ids
  // stay unique across the whole diagram (mermaid requires global uniqueness).
  function safeId(s: string): string {
    return s.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  for (const cls of ir.classes ?? []) {
    if (!cls.methods || cls.methods.length === 0) continue;
    const classId = safeId(cls.name || "module");
    lines.push(`  subgraph ${classId}["${escapeLabel(cls.name || "module")}"]`);
    // Stack methods vertically inside the class box. Without this, dagre lays
    // sibling subgraphs out side-by-side and the whole-program diagram sprawls
    // across the entire viewport width — making cross-method arrows travel
    // hundreds of pixels. With TB, the diagram gets taller instead of wider
    // and arrows stay short.
    lines.push(`    direction TB`);

    // Emit methods in topological call order: entry points first, callees
    // after. Mermaid's dagre layout reads nodes top-to-bottom by source order,
    // so this ordering is what actually produces the "entry on top, callees
    // below" hierarchy the user wants. Stable sort preserves the parser's
    // declaration order for siblings at the same depth.
    const methodOrder = topoSortMethods(cls.methods ?? [], definedByName);

    // Phase 1 — emit method header nodes at the TOP LEVEL of the class subgraph
    // (above any body subgraphs). Cross-method edges and the in→body arrows land
    // on these top-level header nodes, which dagre can route freely without
    // getting clipped by the body subgraph's bounding box. Putting the header
    // inside the body subgraph is what causes the arrows in the screenshot to
    // disappear at the box edge — they had to cross two nested subgraph bounds.
    const methodHeaderIds = new Map<string, string>(); // methodName -> header node id

    for (const method of methodOrder) {
      const methodId = `${classId}_${safeId(method.name)}`;
      methods.set(methodId, {
        methodName: method.name,
        className: cls.name || "module",
        line: method.startLine,
      });

      const paramList = method.params.map((p) => p.name).join(", ");
      // The header node lives outside the body subgraph so cross-method arrows
      // can attach to it cleanly. Entry points (no inbound call edges) get a
      // green border so the user can spot where execution starts.
      const headerId = `${methodId}_h`;
      const headerClass = isEntryPoint(method.name) ? "entryNode" : "startNode";
      lines.push(`    ${headerId}${shapeSyntax("stadium", `▶ ${truncate(method.name + "(" + paramList + ")", 36)}`)}:::${headerClass}`);
      lines.push(`    click ${headerId} call onWholeProgramMethodClick("${escapeLabel(method.name)}")`);
      tooltips.set(headerId, `Method entry: ${method.signature || `${method.name}(${paramList})`}`);
      methodHeaderIds.set(method.name, headerId);
    }

    // Phase 2 — emit method body subgraphs. The first body node connects from
    // the top-level header (crossing the body subgraph's boundary on entry),
    // and any call node whose target is another defined method draws a dotted
    // arrow to that method's top-level header — both ends are outside the
    // deepest nested subgraph, so the arrows render all the way through.
    for (const method of methodOrder) {
      const methodId = `${classId}_${safeId(method.name)}`;
      const headerId = methodHeaderIds.get(method.name)!;

      lines.push(`    subgraph ${methodId}["${escapeLabel(method.name)}()"]`);
      lines.push(`      direction TB`);

      // Per-method emission — uses the same node vocabulary as the per-method
      // flowchart but with prefixed ids so multiple methods can coexist.
      let n = 0;
      const emitted: { id: string; line: number; endLine: number }[] = [];
      const newId = () => `${methodId}_n${++n}`;

      function addLocal(
        shape: NodeDef["shape"],
        text: string,
        line: number,
        cssClass: string,
        endLine?: number,
        tooltip?: string
      ): string {
        const id = newId();
        emitted.push({ id, line, endLine: endLine ?? line });
        if (tooltip) tooltips.set(id, tooltip);
        lines.push(`      ${id}${shapeSyntax(shape, text)}:::${cssClass}`);
        lines.push(`      click ${id} call onFlowchartNodeClick("${line}")`);
        return id;
      }

      const finalId = walkLocal(method.body, headerId);
      const endId = addLocal("stadium", "End", method.endLine, "endNode", method.endLine);
      pushEdge(`      ${finalId} --> ${endId}`);

      function walkLocal(body: StatementNode[], entryId: string): string {
        let current = entryId;
        for (const stmt of body) {
          current = emitLocal(stmt, current);
        }
        return current;
      }

      function emitLocal(stmt: StatementNode, entryId: string): string {
        switch (stmt.type) {
          case "loop": {
            const condition = stmt.condition ? ` ${truncate(stmt.condition, 32)}` : "";
            const loopId = addLocal(
              "diamond",
              `${stmt.kind}${condition} · L${stmt.line}`,
              stmt.line,
              "loopNode",
              stmt.endLine,
              stmt.condition ? `${stmt.kind} (while ${stmt.condition} is true)` : `${stmt.kind} loop`
            );
            pushEdge(`      ${entryId} --> ${loopId}`);
            const bodyExit = walkLocal(stmt.body, loopId);
            if (bodyExit !== loopId) pushEdge(`      ${bodyExit} --> ${loopId}`);
            return loopId;
          }
          case "if": {
            const firstCondition = stmt.branches.find((b) => b.condition)?.condition ?? "";
            const ifId = addLocal(
              "diamond",
              `if ${truncate(firstCondition, 32)} · L${stmt.line}`,
              stmt.line,
              "decision",
              nodeEndLine(stmt),
              stmt.branches.filter((b) => b.condition).map((b) => `if ${b.condition}`).join("; ") || `if — line ${stmt.line}`
            );
            pushEdge(`      ${entryId} --> ${ifId}`);
            const joinId = addLocal("rect", "merge", stmt.line, "process", stmt.line);
            for (const branch of stmt.branches) {
              const branchExit = walkLocal(branch.body, ifId);
              pushEdge(`      ${branchExit} --> ${joinId}`);
            }
            return joinId;
          }
          case "switch": {
            const switchId = addLocal(
              "diamond",
              `switch · L${stmt.line}`,
              stmt.line,
              "decision",
              nodeEndLine(stmt),
              `switch — line ${stmt.line}`
            );
            pushEdge(`      ${entryId} --> ${switchId}`);
            const joinId = addLocal("rect", "merge", stmt.line, "process", stmt.line);
            for (const c of stmt.cases) {
              const caseExit = walkLocal(c.body, switchId);
              pushEdge(`      ${caseExit} --> ${joinId}`);
            }
            return joinId;
          }
          case "try": {
            const tryId = addLocal("rect", `try · L${stmt.line}`, stmt.line, "tryNode", nodeEndLine(stmt), `try block — line ${stmt.line}`);
            pushEdge(`      ${entryId} --> ${tryId}`);
            const joinId = addLocal("rect", "merge", stmt.line, "process", stmt.line);
            const tryExit = walkLocal(stmt.body, tryId);
            pushEdge(`      ${tryExit} --> ${joinId}`);
            for (const c of stmt.catches) {
              const catchId = addLocal("rect", `catch ${truncate(c.exceptionType, 20)}`, stmt.line, "tryNode", stmt.line, `catch ${c.exceptionType}`);
              pushEdge(`      ${tryId} --> ${catchId}`);
              const catchExit = walkLocal(c.body, catchId);
              pushEdge(`      ${catchExit} --> ${joinId}`);
            }
            return joinId;
          }
          case "call": {
            const args = stmt.args ? `(${truncate(stmt.args, 20)})` : "()";
            const callId = addLocal(
              "subroutine",
              `${truncate(stmt.target, 20)}${args} · L${stmt.line}`,
              stmt.line,
              stmt.isRecursive ? "recursion" : "callNode",
              stmt.line,
              `${stmt.target}(${stmt.args ?? ""})${stmt.isRecursive ? " — recursive call" : ""}`
            );
            pushEdge(`      ${entryId} --> ${callId}`);

            // Cross-method call: arrow to the *top-level* method header so the
            // dagre layout can route the edge without clipping it against the
            // body subgraph's bounding box. (Previously the arrow landed on a
            // nested header, which is what the screenshot showed getting cut
            // off at the box edge.)
            const simpleName = stmt.target.includes(".") ? stmt.target.split(".").pop()! : stmt.target;
            const target = definedByName.get(simpleName);
            if (target && target.method.name !== method.name) {
              const targetHeaderId = methodHeaderIds.get(target.method.name);
              if (targetHeaderId) {
                pushCrossEdge(`      ${callId} -.-> ${targetHeaderId}`);
              }
            } else if (isLibraryCall(stmt.target)) {
              const extNode = externalId(stmt.target);
              pushEdge(`      ${callId} -.-> ${extNode}`);
            }
            return callId;
          }
          case "return": {
            const value = stmt.value ? ` ${truncate(stmt.value, 28)}` : "";
            const retId = addLocal(
              "stadium",
              `return${value} · L${stmt.line}`,
              stmt.line,
              "returnNode",
              stmt.line,
              stmt.value ? `return ${stmt.value}` : "return"
            );
            pushEdge(`      ${entryId} --> ${retId}`);
            return retId;
          }
          default: {
            const stmtId = addLocal(
              "rect",
              `${truncate(stmt.text, 36)} · L${stmt.line}`,
              stmt.line,
              "process",
              stmt.line,
              stmt.text
            );
            pushEdge(`      ${entryId} --> ${stmtId}`);
            return stmtId;
          }
        }
      }

      // Attach comment notes (same rule as the per-method flowchart). When the
      // note's owner is the method header, we draw the dotted edge outside the
      // body subgraph so it stays visible at the box edge.
      for (const tag of method.comments ?? []) {
        let ownerId: string | null = null;
        for (const e of emitted) {
          if (e.line <= tag.line && tag.line <= e.endLine) ownerId = e.id;
        }
        if (!ownerId) {
          const next = emitted.find((e) => e.line > tag.line);
          ownerId = next ? next.id : finalId;
        }
        const noteId = newId();
        lines.push(
          `      ${noteId}${shapeSyntax("round", `[${tag.tag}] ${truncate(tag.text, 56)} · L${tag.line}`)}:::${NOTE_CLASS[tag.tag]}`
        );
        tooltips.set(noteId, `// ${tag.tag}: ${tag.text}`);
        pushEdge(`      ${ownerId} -.-> ${noteId}`);
      }

      lines.push(`    end`);
    }

    lines.push(`  end`);
  }

  // External library-call nodes — emitted last so they live outside any class
  // subgraph and the cross-method dotted edges land on them.
  for (const [call, id] of externals) {
    lines.push(`  ${id}["${escapeLabel(call)}"]:::external`);
    tooltips.set(id, `external: ${call}`);
  }

  lines.push(CLASS_DEFS[theme].split("\n").map((l) => `  ${l}`).join("\n"));

  // Cross-method call arrows are the program's "call path" — render them bold
  // so the hierarchy is scannable even in a dense diagram. Mermaid `linkStyle`
  // takes numeric edge indices (declaration order), which pushEdge tracks.
  if (crossEdgeIndices.length > 0) {
    const stroke = theme === "light" ? "#0969da" : "#79c0ff";
    const styles = crossEdgeIndices.map((idx) => `linkStyle ${idx} stroke-width:3px,stroke:${stroke}`).join("\n  ");
    lines.push(`  ${styles}`);
  }

  return { diagram: lines.join("\n"), tooltips, methods };
}
