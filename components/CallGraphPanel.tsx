"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaid, renderDiagramWithTheme } from "./mermaidSetup";
import { PanZoom } from "./PanZoom";
import { downloadPng, downloadSvg, svgFromString } from "@/lib/export/download";
import { useTheme } from "@/lib/theme";
import { attachSvgTooltips, type TooltipMap } from "@/lib/flowchart/tooltips";

export function CallGraphPanel({
  diagram,
  diagramLight,
  tooltips,
  name,
  onMethodClick,
}: {
  diagram: string | null;
  diagramLight: string | null;
  // nodeId -> tooltip text (signature, time, space, line count). Server-built
  // alongside the diagram and injected as SVG <title> elements for hover.
  tooltips?: Record<string, string> | null;
  name?: string;
  onMethodClick: (methodName: string) => void;
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const rawId = useId();
  const handlerName = useMemo(
    () => `onCallGraphNodeClick_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );

  // Display follows the UI theme; fall back to the dark diagram if the light
  // one is missing for any reason.
  const displayDiagram = theme === "light" ? diagramLight ?? diagram : diagram;
  const scopedDiagram = useMemo(
    () => (displayDiagram ? displayDiagram.replaceAll("onCallGraphNodeClick", handlerName) : null),
    [displayDiagram, handlerName]
  );

  useEffect(() => {
    (window as any)[handlerName] = (methodName: string) => onMethodClick(methodName);
    return () => {
      delete (window as any)[handlerName];
    };
  }, [handlerName, onMethodClick]);

  useEffect(() => {
    if (!scopedDiagram || !containerRef.current) return;
    setError(null);
    setRendered(false);
    ensureMermaid(theme);
    const id = `callgraph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mermaid
      .render(id, scopedDiagram)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Signature + time/space tooltips on hover.
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl && tooltips) {
            const map: TooltipMap = new Map(Object.entries(tooltips));
            attachSvgTooltips(svgEl as SVGSVGElement, map);
          }
          setRendered(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [scopedDiagram, theme, tooltips]);

  // Exports are always light.
  async function buildLightSvg(): Promise<SVGSVGElement | null> {
    const light = diagramLight ?? diagram;
    if (!light) return null;
    const scoped = light.replaceAll("onCallGraphNodeClick", handlerName);
    const source = await renderDiagramWithTheme(scoped, "light");
    return svgFromString(source);
  }

  async function exportPng() {
    setExportError(null);
    setExporting(true);
    try {
      const svg = await buildLightSvg();
      if (!svg) throw new Error("Could not render the diagram.");
      await downloadPng(svg, name ?? "callgraph", "#ffffff");
    } catch (e) {
      setExportError(`PNG export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  async function exportSvg() {
    setExportError(null);
    setExporting(true);
    try {
      const svg = await buildLightSvg();
      if (!svg) throw new Error("Could not render the diagram.");
      downloadSvg(svg, name ?? "callgraph");
    } catch (e) {
      setExportError(`SVG export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  if (!diagram) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        No call graph available.
      </div>
    );
  }

  if (error) {
    return <div className="p-panel-padding text-body-sm text-error">Failed to render call graph: {error}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
        <span className="label-caps">Call graph — click a method to open its flowchart</span>
        <div className="flex items-center gap-2">
          {exportError && <span className="text-code-sm text-error">{exportError}</span>}
          <button
            disabled={!rendered || exporting}
            onClick={exportPng}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Download call graph as PNG (light theme)"
          >
            PNG
          </button>
          <button
            disabled={!rendered || exporting}
            onClick={exportSvg}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Download call graph as SVG (light theme)"
          >
            SVG
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PanZoom>
          <div ref={containerRef} className="cl-diagram" />
        </PanZoom>
      </div>
    </div>
  );
}
