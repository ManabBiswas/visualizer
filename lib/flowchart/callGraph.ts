import { ProgramIR, MethodIR } from "@/lib/ir";
import { escapeLabel } from "./generate";
import type { Theme } from "@/lib/theme";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import type { TooltipMap } from "./tooltips";

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
 * Each internal method node carries a complexity badge (e.g. "O(log n)")
 * inside its label and a richer hover tooltip (signature + time/space) in
 * the returned `tooltips` side table. The two are produced together so the
 * client can show "O(n) loops in a helper" at a glance without opening it.
 *
 * Clicking an internal node calls the global handler with the method name so
 * the editor can switch to that method's flowchart.
 */
export function generateCallGraph(
  ir: ProgramIR,
  handlerName = "onCallGraphNodeClick",
  theme: Theme = "dark",
): { diagram: string; tooltips: TooltipMap } | null {
  const methods = ir.classes.flatMap((c) => c.methods ?? []);
  if (methods.length <= 1) return null;

  const defined = new Map<string, { id: string; method: MethodIR }>();
  methods.forEach((m, i) => {
    if (!defined.has(m.name)) defined.set(m.name, { id: `m${i + 1}`, method: m });
  });

  // First pass: compute complexity for each defined method so we can decorate
  // its node label. The same computation is reused in the tooltip text, so
  // the per-node cost is paid once per method, not twice.
  const complexityByMethod = new Map<string, { time: string; space: string; signature: string; lines: number }>();
  for (const [name, { method }] of defined) {
    const result = analyzeComplexity(method);
    complexityByMethod.set(name, {
      time: result.time.bigO,
      space: result.space.bigO,
      signature: method.signature,
      lines: method.endLine - method.startLine + 1,
    });
  }

  const nodes: { id: string; label: string; cssClass: string; methodName?: string; tooltip?: string }[] = [];
  const edges: { from: string; to: string }[] = [];
  const externals = new Map<string, string>();
  const seenEdges = new Set<string>();
  const emittedInternal = new Set<string>();
  const tooltips: TooltipMap = new Map();

  for (const method of methods) {
    const def = defined.get(method.name)!;
    const fromId = def.id;
    if (!emittedInternal.has(method.name)) {
      emittedInternal.add(method.name);
      const cx = complexityByMethod.get(method.name)!;
      const badge = cx.time && cx.time !== "1" && cx.time !== "O(1)" ? ` · ${cx.time}` : "";
      const label = `${method.name}()${badge}`;
      const tooltip =
        `${cx.signature}\n` +
        `time: ${cx.time}    space: ${cx.space}\n` +
        `~${cx.lines} lines, starts at L${method.startLine}`;
      nodes.push({ id: fromId, label, cssClass: "internal", methodName: method.name });
      tooltips.set(fromId, tooltip);
    }

    for (const call of method.calls ?? []) {
      const simpleName = call.includes(".") ? call.split(".").pop()! : call;
      let toId: string;

      if (defined.has(simpleName)) {
        toId = defined.get(simpleName)!.id;
      } else if (/^[A-Z]\w*\./.test(call)) {
        if (!externals.has(call)) {
          const extId = `x${externals.size + 1}`;
          externals.set(call, extId);
          nodes.push({ id: extId, label: call, cssClass: "external" });
          // Library calls often have a known cost — show it on hover so the
          // user can decide whether to dig into the helper or trust the lib.
          tooltips.set(extId, `external: ${call}`);
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
  const classDefs: Record<Theme, [string, string]> = {
    dark: [
      "  classDef internal fill:#10141a,stroke:#38bdf8,stroke-width:1px,color:#dfe2eb",
      "  classDef external fill:#1c2026,stroke:#3e484f,stroke-width:1px,color:#8b949e,stroke-dasharray:3 3",
    ],
    light: [
      "  classDef internal fill:#ffffff,stroke:#0969da,stroke-width:1px,color:#1f2328",
      "  classDef external fill:#f6f8fa,stroke:#d0d7de,stroke-width:1px,color:#6e7781,stroke-dasharray:3 3",
    ],
  };
  lines.push(...classDefs[theme]);

  return { diagram: lines.join("\n"), tooltips };
}

/**
 * Back-compat: callers that only need the diagram text (e.g. tests) get
 * the same string the old function returned.
 */
export function generateCallGraphDiagram(
  ir: ProgramIR,
  handlerName = "onCallGraphNodeClick",
  theme: Theme = "dark",
): string | null {
  return generateCallGraph(ir, handlerName, theme)?.diagram ?? null;
}
