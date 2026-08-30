// @vitest-environment happy-dom
import { describe, it, expect, beforeAll } from "vitest";

// Mermaid's edge routing calls SVG geometry APIs that happy-dom doesn't
// implement. Provide minimal stubs so render() completes — we only care
// about the structural output, not pixel layout.
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
import { generateFlowchart } from "@/lib/flowchart/generate";
import type { MethodIR, CommentTag, StatementNode } from "@/lib/ir";

function methodWith(body: StatementNode[], comments: CommentTag[] = []): MethodIR {
  return {
    name: "x",
    params: [],
    startLine: 1,
    endLine: 9,
    body,
    comments,
  } as unknown as MethodIR;
}

describe("mermaid XSS safety with hostile user code", () => {
  it("renders switch case labels containing HTML without emitting raw HTML in the SVG", { timeout: 60_000 }, async () => {
    ensureMermaid();
    const hostile = '<img src=x onerror=alert(1)> <script>alert(2)</script> "break" `tick`';
    const diagram = generateFlowchart(
      methodWith([
        {
          type: "switch",
          line: 3,
          cases: [
            { label: hostile, body: [{ type: "statement", line: 4, text: "break;" }] },
          ],
        },
        { type: "return", line: 8, value: "0" },
      ])
    );

    const { svg } = await mermaid.render("xss-switch", diagram);

    expect(svg).not.toMatch(/<img\s/);
    expect(svg).not.toMatch(/<script\s/);
    expect(svg).not.toMatch(/\son\w+\s*=\s*"/);
  });

  it("renders note comments containing HTML without emitting raw HTML in the SVG", { timeout: 60_000 }, async () => {
    ensureMermaid();
    const hostile = '<a href="javascript:alert(1)">x</a> <svg onload=alert(2)> "q" </text>';
    const diagram = generateFlowchart(
      methodWith(
        [{ type: "return", line: 3, value: "1" }],
        [{ tag: "q", text: hostile, line: 2 } as CommentTag]
      )
    );

    const { svg } = await mermaid.render("xss-note", diagram);

    // Raw (unencoded) HTML/JS vectors must not appear — entity-encoded
    // text (&lt;a href=...) is inert and fine. Assert on executable forms.
    expect(svg).not.toMatch(/<img\s/);
    expect(svg).not.toMatch(/<script\s/);
    expect(svg).not.toMatch(/<a\s[^>]*href=/);
    expect(svg).not.toMatch(/<svg[^>]*onload=/);
    expect(svg).not.toMatch(/\son\w+\s*=\s*"/);
    // The hostile text must still be present but as encoded text, i.e. the
    // payload did not get dropped silently — it is shown harmlessly.
    expect(svg.toLowerCase()).toContain("javascript");
  });
});
