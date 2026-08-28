import { ProgramIR } from "@/lib/ir";
import { escapeLabel } from "./generate";

/**
 * Builds a Mermaid call graph for multi-method problems (e.g. a DFS with a
 * separate helper). Returns null for single-method problems — the UI hides
 * the tab entirely in that case rather than showing an empty graph.
 *
 * Internal methods are accent-colored nodes; qualified library/JDK calls
 * (receiver starts with an uppercase name, e.g. Arrays.sort) render as
 * dimmed leaf nodes. Unqualified external calls (println, containsKey on
 * locals, ...) are skipped to avoid noise.
 *
 * Clicking an internal node calls the global handler with the method name so
 * the editor can switch to that method's flowchart.
 */
export function generateCallGraph(ir: ProgramIR, handlerName = "onCallGraphNodeClick"): string | null {
  const methods = ir.classes.flatMap((c) => c.methods ?? []);
  if (methods.length <= 1) return null;

  const defined = new Map<string, string>();
  methods.forEach((m, i) => {
    if (!defined.has(m.name)) defined.set(m.name, `m${i + 1}`);
  });

  const nodes: { id: string; label: string; cssClass: string; methodName?: string }[] = [];
  const edges: { from: string; to: string }[] = [];
  const externals = new Map<string, string>();
  const seenEdges = new Set<string>();
  const emittedInternal = new Set<string>();

  for (const method of methods) {
    const fromId = defined.get(method.name)!;
    if (!emittedInternal.has(method.name)) {
      emittedInternal.add(method.name);
      nodes.push({ id: fromId, label: `${method.name}()`, cssClass: "internal", methodName: method.name });
    }

    for (const call of method.calls ?? []) {
      const simpleName = call.includes(".") ? call.split(".").pop()! : call;
      let toId: string;

      if (defined.has(simpleName)) {
        toId = defined.get(simpleName)!;
      } else if (/^[A-Z]\w*\./.test(call)) {
        if (!externals.has(call)) {
          const extId = `x${externals.size + 1}`;
          externals.set(call, extId);
          nodes.push({ id: extId, label: call, cssClass: "external" });
        }
        toId = externals.get(call)!;
      } else {
        continue;
      }

      const key = `${fromId}->${toId}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push({ from: fromId, to: toId });
      }
    }
  }

  const lines: string[] = ["graph LR"];
  for (const node of nodes) {
    lines.push(`  ${node.id}["${escapeLabel(node.label)}"]:::${node.cssClass}`);
    if (node.methodName) {
      lines.push(`  click ${node.id} call ${handlerName}("${escapeLabel(node.methodName)}")`);
    }
  }
  for (const edge of edges) {
    lines.push(`  ${edge.from} --> ${edge.to}`);
  }
  lines.push(
    "  classDef internal fill:#10141a,stroke:#38bdf8,stroke-width:1px,color:#dfe2eb",
    "  classDef external fill:#1c2026,stroke:#3e484f,stroke-width:1px,color:#8b949e,stroke-dasharray:3 3"
  );

  return lines.join("\n");
}
