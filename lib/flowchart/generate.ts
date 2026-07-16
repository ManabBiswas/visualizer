import { MethodIR, StatementNode } from "@/lib/ir";

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `n${idCounter}`;
}

type Edge = { from: string; to: string; label?: string };
type NodeDef = { id: string; shape: "rect" | "diamond" | "stadium" | "subroutine"; text: string; line: number };

/**
 * Converts a method's statement tree into Mermaid flowchart syntax.
 * Each node gets a `click` binding wired to a global `onFlowchartNodeClick(line)`
 * handler (registered by the frontend) so hovering/clicking a node can highlight
 * the corresponding source line in the editor (see DESIGN.md 3.2).
 */
export function generateFlowchart(method: MethodIR): string {
  idCounter = 0;
  const nodes: NodeDef[] = [];
  const edges: Edge[] = [];

  const startId = nextId();
  nodes.push({ id: startId, shape: "stadium", text: `Start: ${method.name}`, line: method.startLine });

  const endId = walk(method.body, startId);

  const finalId = nextId();
  nodes.push({ id: finalId, shape: "stadium", text: "End", line: method.endLine });
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
        const loopId = nextId();
        nodes.push({ id: loopId, shape: "diamond", text: `${stmt.kind} (line ${stmt.line})`, line: stmt.line });
        edges.push({ from: entryId, to: loopId });
        const bodyExit = walk(stmt.body, loopId);
        edges.push({ from: bodyExit, to: loopId, label: "loop" });
        return loopId; // exits when condition false; downstream nodes attach here
      }
      case "if": {
        const ifId = nextId();
        nodes.push({ id: ifId, shape: "diamond", text: `if (line ${stmt.line})`, line: stmt.line });
        edges.push({ from: entryId, to: ifId });
        const joinId = nextId();
        nodes.push({ id: joinId, shape: "rect", text: "merge", line: stmt.line });
        for (const branch of stmt.branches) {
          const branchExit = walk(branch.body, ifId);
          edges.push({ from: branchExit, to: joinId, label: branch.isElse ? "else" : "true" });
        }
        return joinId;
      }
      case "switch": {
        const switchId = nextId();
        nodes.push({ id: switchId, shape: "diamond", text: `switch (line ${stmt.line})`, line: stmt.line });
        edges.push({ from: entryId, to: switchId });
        const joinId = nextId();
        nodes.push({ id: joinId, shape: "rect", text: "merge", line: stmt.line });
        for (const c of stmt.cases) {
          const caseExit = walk(c.body, switchId);
          edges.push({ from: caseExit, to: joinId, label: c.label });
        }
        return joinId;
      }
      case "try": {
        const tryId = nextId();
        nodes.push({ id: tryId, shape: "rect", text: `try (line ${stmt.line})`, line: stmt.line });
        edges.push({ from: entryId, to: tryId });
        const joinId = nextId();
        nodes.push({ id: joinId, shape: "rect", text: "merge", line: stmt.line });
        const tryExit = walk(stmt.body, tryId);
        edges.push({ from: tryExit, to: joinId });
        for (const c of stmt.catches) {
          const catchId = nextId();
          nodes.push({ id: catchId, shape: "rect", text: `catch ${c.exceptionType}`, line: stmt.line });
          edges.push({ from: tryId, to: catchId, label: "exception" });
          const catchExit = walk(c.body, catchId);
          edges.push({ from: catchExit, to: joinId });
        }
        return joinId;
      }
      case "call": {
        const callId = nextId();
        nodes.push({ id: callId, shape: "subroutine", text: `${stmt.target}()`, line: stmt.line });
        edges.push({ from: entryId, to: callId });
        return callId;
      }
      case "return": {
        const retId = nextId();
        nodes.push({ id: retId, shape: "stadium", text: `return (line ${stmt.line})`, line: stmt.line });
        edges.push({ from: entryId, to: retId });
        return retId;
      }
      default: {
        const stmtId = nextId();
        nodes.push({ id: stmtId, shape: "rect", text: `line ${stmt.line}`, line: stmt.line });
        edges.push({ from: entryId, to: stmtId });
        return stmtId;
      }
    }
  }

  const lines: string[] = ["flowchart TD"];
  for (const node of nodes) {
    lines.push(`  ${node.id}${shapeSyntax(node.shape, node.text)}`);
    lines.push(`  click ${node.id} call onFlowchartNodeClick("${node.line}")`);
  }
  for (const edge of edges) {
    lines.push(`  ${edge.from} ${edge.label ? `-- ${edge.label} -->` : "-->"} ${edge.to}`);
  }

  return lines.join("\n");
}

function shapeSyntax(shape: NodeDef["shape"], text: string): string {
  const escaped = text.replace(/"/g, "'");
  switch (shape) {
    case "diamond":
      return `{"${escaped}"}`;
    case "stadium":
      return `("${escaped}")`;
    case "subroutine":
      return `[["${escaped}"]]`;
    default:
      return `["${escaped}"]`;
  }
}
