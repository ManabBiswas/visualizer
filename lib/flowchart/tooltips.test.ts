// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";
import { attachSvgTooltips, highlightNode } from "@/lib/flowchart/tooltips";

// happy-dom does not implement SVG geometry — stub the methods mermaid uses
// during render. We don't render mermaid here (we only manipulate the DOM),
// but several methods on the prototype trip up assertions downstream.
beforeAll(() => {
  if (!("getPointAtLength" in SVGPathElement.prototype)) {
    (SVGPathElement.prototype as any).getPointAtLength = function () {
      return { x: 0, y: 0 };
    };
  }
});

function makeSvgWithNodes(ids: string[]): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
  for (const id of ids) {
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "node");
    g.setAttribute("id", `flowchart-${id}-42`);
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    g.appendChild(rect);
    svg.appendChild(g);
  }
  return svg;
}

describe("highlightNode", () => {
  it("toggles cl-active onto a single node and clears any previous one", () => {
    const svg = makeSvgWithNodes(["n1", "n2", "n3"]);

    highlightNode(svg, "n1");
    expect(svg.querySelectorAll("g.node.cl-active").length).toBe(1);
    expect(svg.querySelector("g#flowchart-n1-42")?.classList.contains("cl-active")).toBe(true);

    // Move to a different node — the previous one must be cleared.
    highlightNode(svg, "n2");
    expect(svg.querySelectorAll("g.node.cl-active").length).toBe(1);
    expect(svg.querySelector("g#flowchart-n1-42")?.classList.contains("cl-active")).toBe(false);
    expect(svg.querySelector("g#flowchart-n2-42")?.classList.contains("cl-active")).toBe(true);
  });

  it("clears all highlights when passed null", () => {
    const svg = makeSvgWithNodes(["n1", "n2"]);
    highlightNode(svg, "n1");
    expect(svg.querySelectorAll("g.node.cl-active").length).toBe(1);

    highlightNode(svg, null);
    expect(svg.querySelectorAll("g.node.cl-active").length).toBe(0);
  });

  it("is a no-op for unknown node ids", () => {
    const svg = makeSvgWithNodes(["n1", "n2"]);
    highlightNode(svg, "does-not-exist");
    expect(svg.querySelectorAll("g.node.cl-active").length).toBe(0);
  });

  it("resolves data-id the same way as the id-prefix regex", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg") as SVGSVGElement;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "node");
    g.setAttribute("data-id", "n99");
    // No id attribute on purpose — the data-id branch should still resolve.
    g.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "rect"));
    svg.appendChild(g);

    highlightNode(svg, "n99");
    expect(svg.querySelector("g.node")?.classList.contains("cl-active")).toBe(true);
  });

  it("coexists with attachSvgTooltips (both mutate the same g.node groups)", () => {
    const svg = makeSvgWithNodes(["n1", "n2"]);
    const tooltips = new Map<string, string>([
      ["n1", "while condition text"],
      ["n2", "return value"],
    ]);
    attachSvgTooltips(svg, tooltips);
    expect(svg.querySelectorAll("g.node > title").length).toBe(2);

    highlightNode(svg, "n1");
    // Tooltip is still there, and the active class is set.
    expect(svg.querySelector("g#flowchart-n1-42 > title")?.textContent).toBe("while condition text");
    expect(svg.querySelector("g#flowchart-n1-42")?.classList.contains("cl-active")).toBe(true);
  });
});
