"use client";

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
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

export function FlowchartPanel({
  diagram,
  onNodeHover,
}: {
  diagram: string | null;
  onNodeHover: (line: number | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Global handler referenced by the `click` bindings emitted in lib/flowchart/generate.ts
    (window as any).onFlowchartNodeClick = (line: string) => onNodeHover(Number(line));
  }, [onNodeHover]);

  useEffect(() => {
    if (!diagram || !containerRef.current) return;
    setError(null);
    const id = `flowchart-${Date.now()}`;
    mermaid
      .render(id, diagram)
      .then(({ svg }) => {
        if (containerRef.current) containerRef.current.innerHTML = svg;
      })
      .catch((e) => setError(String(e)));
  }, [diagram]);

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
    <div className="h-full overflow-auto p-panel-padding">
      <div ref={containerRef} />
    </div>
  );
}
