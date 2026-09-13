// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";

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

import { renderDiagram } from "@/components/mermaidSetup";

describe("useMaxWidth:false SVG sizing", () => {
  it("renders with explicit width/height attributes (not 100%)", { timeout: 30_000 }, async () => {
    const svg = await renderDiagram('flowchart TD\n  n1["hello world label"]', "light", "audit");
    const w = svg.match(/<svg[^>]*\swidth="([^"]*)"/)?.[1];
    const h = svg.match(/<svg[^>]*\sheight="([^"]*)"/)?.[1];
    const vb = svg.match(/<svg[^>]*\sviewBox="([^"]*)"/)?.[1];
    console.log("width:", w, "| height:", h, "| viewBox:", vb);
    // The audit claim: explicit px dims instead of width="100%".
    expect(w).toBeDefined();
    expect(w).not.toBe("100%");
    expect(h).toBeDefined();
    expect(h).not.toBe("100%");
  });
});
