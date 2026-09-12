"use client";

import { useState } from "react";
import { toast } from "@/components/Toast";
import { downloadPng, downloadSvg, svgFromString } from "@/lib/export/download";
import { renderDiagram } from "@/components/mermaidSetup";

/**
 * Shared export actions for diagram panels (flowchart, call graph, diff).
 * Both PNG and SVG exports always render the LIGHT variant of the diagram,
 * regardless of the current UI theme — exported images land in slides/notes
 * on white backgrounds.
 *
 * `buildLightDiagram` must return the mermaid source string with any
 * click-handler tokens already scoped (e.g. onFlowchartNodeClick → the
 * panel's unique handler name).
 */
export function useDiagramExport(buildLightDiagram: () => string | null, baseName: string) {
  const [exporting, setExporting] = useState(false);

  async function buildLightSvg(): Promise<SVGSVGElement | null> {
    const diagram = buildLightDiagram();
    if (!diagram) return null;
    const source = await renderDiagram(diagram, "light", "export");
    return svgFromString(source);
  }

  async function run(kind: "PNG" | "SVG") {
    setExporting(true);
    try {
      const svg = await buildLightSvg();
      if (!svg) throw new Error("Could not render the diagram.");
      if (kind === "PNG") {
        await downloadPng(svg, baseName, "#ffffff");
      } else {
        downloadSvg(svg, baseName);
      }
    } catch (e) {
      toast.error(`${kind} export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return {
    exporting,
    exportPng: () => run("PNG"),
    exportSvg: () => run("SVG"),
  };
}
