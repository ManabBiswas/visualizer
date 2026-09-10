// Injects animated traveling dots onto mermaid edge paths via the DOM API.
// Mermaid renders edges as <path class="flowchart-link ..."> inside the SVG
// (verified against mermaid 11.17.2 output); a small circle with a nested
// SMIL <animateMotion path="..."> rides each edge, giving every arrow a
// visible sense of direction without any JS per-frame work.
//
// Security: only mermaid-generated attributes are read; the dot elements are
// created via createElementNS with constants for every attribute. No user
// text ever enters this path — the only interpolated value is the edge's own
// `d` attribute, copied verbatim from a mermaid path.

const SVG_NS = "http://www.w3.org/2000/svg";

/** Class added to the SVG root when dots are injected (also the removal hook). */
export const EDGE_DOTS_MARKER = "cl-edge-dots";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Adds a traveling dot to every edge path in a rendered mermaid diagram.
 * Idempotent: dots injected by a previous call are removed first, so
 * re-rendering a diagram (theme switch, method switch) never accumulates.
 *
 * Skipped when the user prefers reduced motion — the static arrows remain.
 */
export function attachEdgeDots(svg: SVGSVGElement): void {
  detachEdgeDots(svg);
  if (prefersReducedMotion()) return;

  const edges = svg.querySelectorAll("path.flowchart-link");
  let injected = 0;
  for (const edge of edges) {
    const d = edge.getAttribute("d");
    if (!d) continue;

    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", "cl-edge-dot");

    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", "3");
    circle.setAttribute("cx", "0");
    circle.setAttribute("cy", "0");

    const motion = document.createElementNS(SVG_NS, "animateMotion");
    motion.setAttribute("dur", "2.4s");
    motion.setAttribute("repeatCount", "indefinite");
    motion.setAttribute("rotate", "auto");
    motion.setAttribute("path", d);
    motion.setAttribute("calcMode", "spline");
    motion.setAttribute("keyTimes", "0;1");
    motion.setAttribute("keySplines", "0.4 0 0.6 1");

    circle.appendChild(motion);
    g.appendChild(circle);
    (edge.parentNode as Element).insertBefore(g, edge.nextSibling);
    injected += 1;
  }
  if (injected > 0) svg.classList.add(EDGE_DOTS_MARKER);
}

/**
 * Removes every traveling dot previously added by attachEdgeDots.
 * Cheap enough to call on every re-render even when nothing was added.
 */
export function detachEdgeDots(svg: SVGSVGElement): void {
  for (const dot of svg.querySelectorAll("g.cl-edge-dot")) dot.remove();
  svg.classList.remove(EDGE_DOTS_MARKER);
}
