"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { ensureMermaid } from "./mermaidSetup";
import { PanZoom } from "./PanZoom";
import { downloadPng, downloadSvg } from "@/lib/export/download";

export function CallGraphPanel({
  diagram,
  name,
  onMethodClick,
}: {
  diagram: string | null;
  name?: string;
  onMethodClick: (methodName: string) => void;
}) {
  ensureMermaid();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rawId = useId();
  const handlerName = useMemo(
    () => `onCallGraphNodeClick_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );
  const scopedDiagram = useMemo(
    () => (diagram ? diagram.replaceAll("onCallGraphNodeClick", handlerName) : null),
    [diagram, handlerName]
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
    const id = `callgraph-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

  async function exportPng() {
    const svg = containerRef.current?.querySelector("svg");
    if (!svg) return;
    setExportError(null);
    try {
      await downloadPng(svg, name ?? "callgraph");
    } catch (e) {
      setExportError(`PNG export failed: ${(e as Error).message}`);
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
            disabled={!rendered}
            onClick={exportPng}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
          >
            PNG
          </button>
          <button
            disabled={!rendered}
            onClick={() => {
              const svg = containerRef.current?.querySelector("svg");
              if (svg) downloadSvg(svg, name ?? "callgraph");
            }}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
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
    </div>
  );
}
