import { MethodIR, StatementNode, CommentTag } from "@/lib/ir";
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
  { label: "Statement", color: "#38bdf8", description: "Assignment, declaration, other code" },
  { label: "Decision", color: "#ffc176", description: "if / switch branch points" },
  { label: "Loop", color: "#d2a8ff", description: "for / while / do-while" },
  { label: "Method call", color: "#79c0ff", description: "Call to another method" },
  { label: "Recursive call", color: "#f85149", description: "Method calling itself" },
  { label: "Return", color: "#238636", description: "Return with value" },
  { label: "q / note / why / complexity", color: "#ffa657", description: "Your tagged comments, attached to the code they annotate" },
];

const CLASS_DEFS: Record<Theme, string> = {
  dark: `
classDef startNode fill:#1c2026,stroke:#8b949e,stroke-width:1px,color:#dfe2eb
classDef endNode fill:#1c2026,stroke:#238636,stroke-width:1px,color:#dfe2eb
classDef process fill:#10141a,stroke:#38bdf8,stroke-width:1px,color:#dfe2eb
classDef decision fill:#10141a,stroke:#ffc176,stroke-width:1px,color:#dfe2eb
classDef loopNode fill:#10141a,stroke:#d2a8ff,stroke-width:1px,color:#dfe2eb
classDef callNode fill:#10141a,stroke:#79c0ff,stroke-width:1px,color:#dfe2eb
classDef recursion fill:#161b22,stroke:#f85149,stroke-width:2px,color:#dfe2eb
classDef returnNode fill:#1c2026,stroke:#238636,stroke-width:1px,color:#dfe2eb
classDef tryNode fill:#10141a,stroke:#8b949e,stroke-width:1px,color:#8b949e
classDef noteQ fill:#262a31,stroke:#8ed5ff,stroke-dasharray:4 3,color:#dfe2eb
classDef noteNote fill:#262a31,stroke:#79c0ff,stroke-dasharray:4 3,color:#dfe2eb
classDef noteWhy fill:#262a31,stroke:#d2a8ff,stroke-dasharray:4 3,color:#dfe2eb
classDef noteComplexity fill:#262a31,stroke:#ffa657,stroke-dasharray:4 3,color:#dfe2eb
`.trim(),
  light: `
classDef startNode fill:#f6f8fa,stroke:#6e7781,stroke-width:1px,color:#1f2328
classDef endNode fill:#f6f8fa,stroke:#1a7f37,stroke-width:1px,color:#1f2328
classDef process fill:#ffffff,stroke:#0969da,stroke-width:1px,color:#1f2328
classDef decision fill:#ffffff,stroke:#bc4c00,stroke-width:1px,color:#1f2328
classDef loopNode fill:#ffffff,stroke:#8250df,stroke-width:1px,color:#1f2328
classDef callNode fill:#ffffff,stroke:#0969da,stroke-width:1px,color:#1f2328
classDef recursion fill:#fff1f0,stroke:#d1242f,stroke-width:2px,color:#1f2328
classDef returnNode fill:#f6f8fa,stroke:#1a7f37,stroke-width:1px,color:#1f2328
classDef tryNode fill:#ffffff,stroke:#6e7781,stroke-width:1px,color:#57606a
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
