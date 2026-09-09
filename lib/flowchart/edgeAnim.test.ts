// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from "vitest";
import { attachEdgeDots, detachEdgeDots, EDGE_DOTS_MARKER } from "@/lib/flowchart/edgeAnim";

// happy-dom does not implement SVG path geometry, but attachEdgeDots only
// copies the `d` attribute verbatim into animateMotion's path — no geometry
// math happens here, so a plain string attribute is enough.

function makeEdge(svg: SVGSVGElement, d: string): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("class", "flowchart-link edge-thickness-normal");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return path;
}

function makeSvg(): SVGSVGElement {
  return document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
}

function reducedMotion(on: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: on && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe("attachEdgeDots", () => {
  beforeAll(() => {
    reducedMotion(false);
  });

  it("adds one traveling dot per flowchart-link path, with SMIL motion along the edge's own d", () => {
    const svg = makeSvg();
    makeEdge(svg, "M0,0L10,10");
    makeEdge(svg, "M10,10L20,20");

    attachEdgeDots(svg);

    const dots = svg.querySelectorAll("g.cl-edge-dot");
    expect(dots.length).toBe(2);
    for (const dot of dots) {
      const circle = dot.querySelector("circle");
      const motion = dot.querySelector("animateMotion");
      expect(circle).not.toBeNull();
      expect(motion).not.toBeNull();
      expect(motion!.getAttribute("path")).toMatch(/^M/);
      expect(motion!.getAttribute("repeatCount")).toBe("indefinite");
    }
    expect(svg.classList.contains(EDGE_DOTS_MARKER)).toBe(true);
  });

  it("copies each edge's exact path into its dot (no drift, no recompute)", () => {
    const svg = makeSvg();
    const d = "M33,8L50,57.5L8,108";
    makeEdge(svg, d);
    attachEdgeDots(svg);
    const motion = svg.querySelector("g.cl-edge-dot animateMotion");
    expect(motion?.getAttribute("path")).toBe(d);
  });

  it("skips paths without a d attribute", () => {
    const svg = makeSvg();
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("class", "flowchart-link");
    svg.appendChild(path);
    attachEdgeDots(svg);
    expect(svg.querySelectorAll("g.cl-edge-dot").length).toBe(0);
    expect(svg.classList.contains(EDGE_DOTS_MARKER)).toBe(false);
  });

  it("is idempotent — re-running replaces dots instead of accumulating", () => {
    const svg = makeSvg();
    makeEdge(svg, "M0,0L10,10");
    attachEdgeDots(svg);
    attachEdgeDots(svg);
    expect(svg.querySelectorAll("g.cl-edge-dot").length).toBe(1);
  });

  it("does nothing when the user prefers reduced motion", () => {
    reducedMotion(true);
    const svg = makeSvg();
    makeEdge(svg, "M0,0L10,10");
    attachEdgeDots(svg);
    expect(svg.querySelectorAll("g.cl-edge-dot").length).toBe(0);
    expect(svg.classList.contains(EDGE_DOTS_MARKER)).toBe(false);
    reducedMotion(false);
  });
});

describe("detachEdgeDots", () => {
  it("removes every dot and the marker class", () => {
    const svg = makeSvg();
    makeEdge(svg, "M0,0L10,10");
    attachEdgeDots(svg);
    expect(svg.querySelectorAll("g.cl-edge-dot").length).toBe(1);

    detachEdgeDots(svg);
    expect(svg.querySelectorAll("g.cl-edge-dot").length).toBe(0);
    expect(svg.classList.contains(EDGE_DOTS_MARKER)).toBe(false);
  });

  it("is safe on an SVG that never had dots", () => {
    const svg = makeSvg();
    makeEdge(svg, "M0,0L10,10");
    expect(() => detachEdgeDots(svg)).not.toThrow();
    expect(svg.querySelectorAll("g.cl-edge-dot").length).toBe(0);
  });
});
