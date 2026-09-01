"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaid, renderDiagramWithTheme } from "./mermaidSetup";
import { PanZoom } from "./PanZoom";
import { generateFlowchartWithTooltips, FLOWCHART_LEGEND } from "@/lib/flowchart/generate";
import { attachSvgTooltips, highlightNode } from "@/lib/flowchart/tooltips";
import { downloadPng, downloadSvg, svgFromString } from "@/lib/export/download";
import { useTheme } from "@/lib/theme";
import type { MethodIR } from "@/lib/ir";

export function FlowchartPanel({
  method,
  onNodeHover,
  showLegend = true,
  label,
  activeLine,
}: {
  method: MethodIR | null;
  onNodeHover: (line: number | null) => void;
  showLegend?: boolean;
  label?: string;
  /**
   * Source line the editor cursor is parked on. When the line maps to a
   * flowchart node, that node gets a `cl-active` highlight. Pass `null`
   * (or omit) to clear. Lines that don't map to a node are ignored.
   */
  activeLine?: number | null;
}) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const name = method?.name;

  // Each panel instance gets its own global click handler so multiple
  // flowcharts (e.g. diff mode) never overwrite each other's bindings.
  const rawId = useId();
  const handlerName = useMemo(
    () => `onFlowchartNodeClick_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );

  // Generate the diagram for the current UI theme so it re-skins with the app.
  // Tooltips ride along in a side table and are injected post-render.
  const scoped = useMemo(() => {
    if (!method) return null;
    return generateFlowchartWithTooltips(method, theme);
  }, [method, theme]);
  const scopedDiagram = useMemo(
    () => scoped?.diagram.replaceAll("onFlowchartNodeClick", handlerName) ?? null,
    [scoped, handlerName]
  );
  const activeNodeId = useMemo(
    () => (scoped && activeLine != null ? scoped.nodeByLine.get(activeLine) ?? null : null),
    [scoped, activeLine]
  );

  useEffect(() => {
    (window as any)[handlerName] = (line: string) => onNodeHover(Number(line));
    return () => {
      delete (window as any)[handlerName];
    };
  }, [handlerName, onNodeHover]);

  useEffect(() => {
    if (!scopedDiagram || !containerRef.current) return;
    setError(null);
    setRendered(false);
    ensureMermaid(theme);
    const id = `flowchart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mermaid
      .render(id, scopedDiagram)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Native hover tooltips with the full untruncated node text.
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            attachSvgTooltips(svgEl as SVGSVGElement, scoped?.tooltips ?? new Map());
            highlightNode(svgEl as SVGSVGElement, activeNodeId);
          }
          setRendered(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [scopedDiagram, scoped, theme, activeNodeId]);

  // Re-apply the active highlight when the editor cursor moves to a different
  // line that maps to a different node (mermaid didn't re-render — cheap).
  useEffect(() => {
    if (!rendered) return;
    const svgEl = containerRef.current?.querySelector("svg");
    if (svgEl) highlightNode(svgEl as SVGSVGElement, activeNodeId);
  }, [activeNodeId, rendered]);

  // Exports are ALWAYS light, regardless of the current UI theme.
  async function buildLightSvg(): Promise<SVGSVGElement | null> {
    if (!method) return null;
    const lightDiagram = generateFlowchartWithTooltips(method, "light").diagram.replaceAll(
      "onFlowchartNodeClick",
      handlerName
    );
    const source = await renderDiagramWithTheme(lightDiagram, "light");
    return svgFromString(source);
  }

  async function exportPng() {
    setExportError(null);
    setExporting(true);
    try {
      const svg = await buildLightSvg();
      if (!svg) throw new Error("Could not render the diagram.");
      await downloadPng(svg, `${name ?? "flowchart"}-flowchart`, "#ffffff");
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
      downloadSvg(svg, `${name ?? "flowchart"}-flowchart`);
    } catch (e) {
      setExportError(`SVG export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  if (!method) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Analyze a method to see its flowchart.
      </div>
    );
  }

  if (error) {
    return <div className="p-panel-padding text-body-sm text-error">Failed to render flowchart: {error}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
        <span className="label-caps">
          Flowchart{(() => {
            const suffix = label ?? (name ? `${name}()` : "");
            return suffix ? ` — ${suffix}` : "";
          })()}
        </span>
        <div className="flex items-center gap-2">
          {exportError && (
            <span className="text-code-sm text-error" title={exportError}>
              {exportError}
            </span>
          )}
          <button
            disabled={!rendered || exporting}
            onClick={exportPng}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Download flowchart as PNG (light theme)"
          >
            PNG
          </button>
          <button
            disabled={!rendered || exporting}
            onClick={exportSvg}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Download flowchart as SVG (light theme)"
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

      {showLegend && (
        <details className="shrink-0 border-t border-panel-border bg-surface-container-lowest px-3 py-1.5">
          <summary className="label-caps cursor-pointer select-none">Color legend</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 pb-1">
            {FLOWCHART_LEGEND.map((entry) => (
              <div key={entry.label} className="flex items-center gap-2 text-code-sm text-on-surface-variant">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm border" style={{ borderColor: entry.color }} />
                <span>
                  <span className="text-on-surface">{entry.label}</span> — {entry.description}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
