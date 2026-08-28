"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaid } from "./mermaidSetup";
import { PanZoom } from "./PanZoom";
import { FLOWCHART_LEGEND } from "@/lib/flowchart/generate";
import { downloadPng, downloadSvg } from "@/lib/export/download";

export function FlowchartPanel({
  diagram,
  name,
  onNodeHover,
  showLegend = true,
}: {
  diagram: string | null;
  name?: string;
  onNodeHover: (line: number | null) => void;
  showLegend?: boolean;
}) {
  ensureMermaid();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Each panel instance gets its own global click handler so multiple
  // flowcharts (e.g. diff mode) never overwrite each other's bindings.
  const rawId = useId();
  const handlerName = useMemo(
    () => `onFlowchartNodeClick_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );
  const scopedDiagram = useMemo(
    () => (diagram ? diagram.replaceAll("onFlowchartNodeClick", handlerName) : null),
    [diagram, handlerName]
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
    const id = `flowchart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    mermaid
      .render(id, scopedDiagram)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      })
      .catch((e) => setError(String(e)));
  }, [scopedDiagram]);

  function getSvg(): SVGSVGElement | null {
    return containerRef.current?.querySelector("svg") ?? null;
  }

  async function exportPng() {
    const svg = getSvg();
    if (!svg) return;
    setExportError(null);
    try {
      await downloadPng(svg, `${name ?? "flowchart"}-flowchart`);
    } catch (e) {
      setExportError(`PNG export failed: ${(e as Error).message}`);
    }
  }

  if (!diagram) {
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
        <span className="label-caps">Flowchart{name ? ` — ${name}()` : ""}</span>
        <div className="flex items-center gap-2">
          {exportError && (
            <span className="text-code-sm text-error" title={exportError}>
              {exportError}
            </span>
          )}
          <button
            disabled={!rendered}
            onClick={exportPng}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Download flowchart as PNG"
          >
            PNG
          </button>
          <button
            disabled={!rendered}
            onClick={() => {
              const svg = getSvg();
              if (svg) downloadSvg(svg, `${name ?? "flowchart"}-flowchart`);
            }}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Download flowchart as SVG"
          >
            SVG
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <PanZoom>
          <div ref={containerRef} />
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
