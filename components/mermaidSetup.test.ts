// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";

// Mermaid's edge routing calls SVG geometry APIs that happy-dom doesn't
// implement. Provide minimal stubs so render() completes — we only care
// about the structural output (foreignObject vs <text>), not pixel layout.
beforeAll(() => {
  const point = { x: 0, y: 0 };
  const rect = { x: 0, y: 0, width: 100, height: 20 };
  const proto = (globalThis as any).SVGPathElement?.prototype;
  const elProto = (globalThis as any).SVGElement?.prototype;
  const geomProto = (globalThis as any).SVGGeometryElement?.prototype;
  for (const p of [proto, elProto, geomProto]) {
    if (!p) continue;
    p.getPointAtLength = p.getPointAtLength ?? (() => point);
    p.getTotalLength = p.getTotalLength ?? (() => 10);
    p.getBBox = p.getBBox ?? (() => rect);
    p.getComputedTextLength = p.getComputedTextLength ?? (() => 50);
  }
  if ((globalThis as any).SVGElement) {
    (globalThis as any).SVGElement.prototype.getBoundingClientRect =
      (globalThis as any).SVGElement.prototype.getBoundingClientRect ??
      (() => ({ x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 }));
  }
});

import mermaid from "mermaid";
import { ensureMermaid } from "@/components/mermaidSetup";

describe("mermaid SVG export-safety", () => {
  it("renders node labels without foreignObject (canvas-safe)", { timeout: 30_000 }, async () => {
    ensureMermaid();
    // Single node, no edges — avoids mermaid's edge-routing (which needs real
    // SVG geometry) while still exercising the label renderer, which is the
    // part that decides between <text> and <foreignObject>.
    const { svg } = await mermaid.render("test-export", 'flowchart TD\n  n1["hello world label"]');

    const foreignObject = svg.match(/<foreignObject/gi) ?? [];
    const externalImages = svg.match(/<image[^>]+(https?:|data:)/gi) ?? [];
    const cssImports = svg.match(/@import/gi) ?? [];

    expect(foreignObject, `foreignObject taints the canvas:\n${svg.slice(0, 2000)}`).toHaveLength(0);
    expect(externalImages).toHaveLength(0);
    expect(cssImports).toHaveLength(0);
    // Labels must render as SVG <text> (canvas-safe). We don't assert the exact
    // string because happy-dom's stubbed text-metrics can reflow/split it.
    expect(svg, `no <text> labels found:\n${svg.slice(0, 2000)}`).toMatch(/<text[\s>]/);
  });
});
