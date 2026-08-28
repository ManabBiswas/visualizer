"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import mermaid from "mermaid";
import { downloadPng, downloadSvg } from "@/lib/export/download";

mermaid.initialize({
  startOnLoad: false,
  securityLevel: "loose",
  theme: "base",
  themeVariables: {
    background: "#10141a",
    primaryColor: "#10141a",
    primaryBorderColor: "#38bdf8",
    primaryTextColor: "#dfe2eb",
    lineColor: "#87929a",
    secondaryColor: "#1c2026",
    tertiaryColor: "#262a31",
    fontFamily: "JetBrains Mono, monospace",
    fontSize: "12px",
  },
});

export function CallGraphPanel({
  diagram,
  name,
  onMethodClick,
}: {
  diagram: string | null;
  name?: string;
  onMethodClick: (methodName: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

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
        <div className="flex gap-2">
          <button
            disabled={!rendered}
            onClick={() => {
              const svg = containerRef.current?.querySelector("svg");
              if (svg) downloadPng(svg, `${name ?? "callgraph"}`);
            }}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
          >
            PNG
          </button>
          <button
            disabled={!rendered}
            onClick={() => {
              const svg = containerRef.current?.querySelector("svg");
              if (svg) downloadSvg(svg, `${name ?? "callgraph"}`);
            }}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary disabled:opacity-40"
          >
            SVG
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-panel-padding">
        <div ref={containerRef} />
      </div>
    </div>
  );
}
