// Injects hover tooltips into a rendered mermaid SVG via the DOM API.
// Mermaid's flowchart syntax has no per-node tooltip directive, so the full
// untruncated node text travels in a side table (see generateFlowchartWithTooltips)
// and becomes native SVG <title> elements here.
//
// Security: text is assigned with textContent, never innerHTML — user code
// (conditions, statements, comments) can never execute from a tooltip.

export type TooltipMap = Map<string, string>;

/**
 * Adds `<title>` hover tooltips to a rendered mermaid SVG.
 * Mermaid node DOM ids are prefixed ("flowchart-n1-42" for node n1) and the
 * node's root group carries a data attribute, so we resolve each node group
 * and append a <title> child directly to it (covers all shapes and the
 * implicit hover target).
 */
export function attachSvgTooltips(svg: SVGSVGElement, tooltips: TooltipMap): void {
  if (tooltips.size === 0) return;

  // Mermaid groups each node's markup under g.node with id "*-{nodeId}-*"
  // (or data-id in newer versions). Build an index of nodeId -> group.
  const groups = new Map<string, SVGGElement>();
  for (const g of svg.querySelectorAll("g.node")) {
    const el = g as SVGGElement;
    const id = el.getAttribute("data-id") ?? undefined;
    const rawId = el.id;
    if (id) {
      groups.set(id, el);
    } else if (rawId) {
      // "flowchart-n1-42" -> "n1" (strip prefix and numeric suffix).
      const m = rawId.match(/^(?:flowchart-)?(.+?)(?:-\d+)?$/);
      if (m) groups.set(m[1], el);
    }
  }

  for (const [nodeId, text] of tooltips) {
    const group = groups.get(nodeId);
    if (!group) continue;
    // Replace any existing title (re-renders) and add ours.
    group.querySelector("title")?.remove();
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = text;
    group.appendChild(title);
  }
}

/**
 * Toggles a `cl-active` class on one mermaid node group, clearing it from
 * any previously active group. Used by the editor-cursor highlight effect.
 * Pass `null` to clear all highlights.
 */
export function highlightNode(svg: SVGSVGElement, nodeId: string | null): void {
  const previously = svg.querySelector("g.node.cl-active");
  if (previously) previously.classList.remove("cl-active");
  if (!nodeId) return;
  // Reuse the same id-extraction rules as attachSvgTooltips so the resolution
  // is symmetric: whatever attachSvgTooltips could find, highlightNode can too.
  const groups = svg.querySelectorAll("g.node");
  for (const g of groups) {
    const el = g as SVGGElement;
    const dataId = el.getAttribute("data-id");
    if (dataId === nodeId) {
      el.classList.add("cl-active");
      return;
    }
    const rawId = el.id;
    if (rawId) {
      const m = rawId.match(/^(?:flowchart-)?(.+?)(?:-\d+)?$/);
      if (m && m[1] === nodeId) {
        el.classList.add("cl-active");
        return;
      }
    }
  }
}
