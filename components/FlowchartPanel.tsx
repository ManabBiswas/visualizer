"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ensureMermaid } from "./mermaidSetup";
import { useDiagramExport } from "./useDiagramExport";
import { PanZoom } from "./PanZoom";
import { generateFlowchartWithTooltips, generateWholeProgramFlowchart, FLOWCHART_LEGEND } from "@/lib/flowchart/generate";
import { attachSvgTooltips, highlightNode } from "@/lib/flowchart/tooltips";
import { attachEdgeDots, detachEdgeDots } from "@/lib/flowchart/edgeAnim";
import { useArrowAnimation } from "@/lib/animation";
import { useTheme } from "@/lib/theme";
import type { MethodIR, ProgramIR } from "@/lib/ir";

type ViewMode = "method" | "program";

export function FlowchartPanel({
  method,
  program,
  onNodeHover,
  onMethodSelect,
  showLegend = true,
  label,
  activeLine,
}: {
  method: MethodIR | null;
  /**
   * Full program IR — enables the "Whole program" view toggle in the panel
   * header. When provided AND the program has more than one method/class,
   * users can switch between the current method's flowchart and a unified
   * diagram containing every class as a subgraph with cross-method call edges.
   */
  program?: ProgramIR | null;
  onNodeHover: (line: number | null) => void;
  /**
   * Fired when the user clicks a method header in the whole-program view.
   * The host (analyze page) uses this to switch the active method so the
   * per-method panel re-renders with the chosen method.
   */
  onMethodSelect?: (methodName: string) => void;
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
  const { animated, toggle } = useArrowAnimation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  // Multi-method/multi-class programs expose a view toggle; single-method
  // programs stay locked on the per-method view (the whole-program diagram
  // would just be one nested box and add no information).
  const showProgramToggle = useMemo(() => {
    if (!program) return false;
    const totalMethods = (program.classes ?? []).reduce((acc, c) => acc + (c.methods?.length ?? 0), 0);
    return totalMethods > 1;
  }, [program]);
  const [view, setView] = useState<ViewMode>("method");
  // Reset to the per-method view when the program/method changes — otherwise
  // a stale "program" toggle could survive a re-analyze and confuse the user.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView("method");
  }, [program, method?.name]);

  const name = method?.name;

  // Each panel instance gets its own global click handler so multiple
  // flowcharts (e.g. diff mode) never overwrite each other's bindings.
  const rawId = useId();
  const handlerName = useMemo(
    () => `onFlowchartNodeClick_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );
  const methodClickHandlerName = useMemo(
    () => `onWholeProgramMethodClick_${rawId.replace(/[^a-zA-Z0-9]/g, "")}`,
    [rawId]
  );

  // Generate the diagram for the current UI theme so it re-skins with the app.
  // Tooltips ride along in a side table and are injected post-render.
  const scoped = useMemo(() => {
    if (view === "program") {
      if (!program) return null;
      return generateWholeProgramFlowchart(program, theme);
    }
    if (!method) return null;
    return generateFlowchartWithTooltips(method, theme);
  }, [view, method, program, theme]);
  const scopedDiagram = useMemo(
    () => scoped?.diagram.replaceAll("onFlowchartNodeClick", handlerName).replaceAll("onWholeProgramMethodClick", methodClickHandlerName) ?? null,
    [scoped, handlerName, methodClickHandlerName]
  );
  const activeNodeId = useMemo(
    () => (scoped && view === "method" && activeLine != null && "nodeByLine" in scoped ? scoped.nodeByLine.get(activeLine) ?? null : null),
    [scoped, activeLine, view]
  );

  useEffect(() => {
    (window as any)[handlerName] = (line: string) => onNodeHover(Number(line));
    return () => {
      delete (window as any)[handlerName];
    };
  }, [handlerName, onNodeHover]);

  useEffect(() => {
    if (!onMethodSelect) return;
    (window as any)[methodClickHandlerName] = (methodName: string) => onMethodSelect(methodName);
    return () => {
      delete (window as any)[methodClickHandlerName];
    };
  }, [methodClickHandlerName, onMethodSelect]);

  // Shared export actions — always light-themed, toast on failure.
  const { exporting, exportPng, exportSvg } = useDiagramExport(() => {
    if (view === "program") {
      if (!program) return null;
      return generateWholeProgramFlowchart(program, "light").diagram
        .replaceAll("onFlowchartNodeClick", handlerName)
        .replaceAll("onWholeProgramMethodClick", methodClickHandlerName);
    }
    if (!method) return null;
    return generateFlowchartWithTooltips(method, "light").diagram.replaceAll(
      "onFlowchartNodeClick",
      handlerName,
    );
  }, `${name ?? "flowchart"}-flowchart`);

  // Mermaid render ONLY on diagram/theme changes. Cursor moves (activeNodeId)
  // and the arrow-anim toggle (animated) are handled by the cheap DOM-pass
  // effects below — re-rendering mermaid on every keystroke would blank the
  // panel and burn ~200ms per render. Both are read through refs so they
  // stay out of the dependency array.
  const renderSeq = useRef(0);
  const activeNodeRef = useRef(activeNodeId);
  const animatedRef = useRef(animated);
  useEffect(() => {
    activeNodeRef.current = activeNodeId;
    animatedRef.current = animated;
  }, [activeNodeId, animated]);
  useEffect(() => {
    if (!scopedDiagram || !containerRef.current) return;
    setError(null);
    setRendered(false);
    const id = `flowchart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const seq = ++renderSeq.current;
    let cancelled = false;
    ensureMermaid(theme)
      .then((mermaid) => mermaid.render(id, scopedDiagram))
      .then(({ svg }) => {
        // Staleness guard: a newer render (method/theme switch) superseded
        // this one — don't clobber the newer SVG with the older result.
        if (seq !== renderSeq.current || cancelled) return;
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
          // Native hover tooltips with the full untruncated node text.
          const svgEl = containerRef.current.querySelector("svg");
          if (svgEl) {
            attachSvgTooltips(svgEl as SVGSVGElement, scoped?.tooltips ?? new Map());
            highlightNode(svgEl as SVGSVGElement, activeNodeRef.current);
            if (animatedRef.current) attachEdgeDots(svgEl as SVGSVGElement);
          }
          setRendered(true);
        }
      })
      .catch((e) => {
        if (seq !== renderSeq.current || cancelled) return; // stale error — ignore
        setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [scopedDiagram, scoped, theme]);

  // Toggle dots on/off without a full mermaid re-render (expensive) — just
  // add/remove them on the already-rendered SVG.
  useEffect(() => {
    if (!rendered) return;
    const svgEl = containerRef.current?.querySelector("svg");
    if (!svgEl) return;
    if (animated) attachEdgeDots(svgEl as SVGSVGElement);
    else detachEdgeDots(svgEl as SVGSVGElement);
  }, [animated, rendered]);

  // Re-apply the active highlight when the editor cursor moves to a different
  // line that maps to a different node (mermaid didn't re-render — cheap).
  useEffect(() => {
    if (!rendered) return;
    const svgEl = containerRef.current?.querySelector("svg");
    if (svgEl) highlightNode(svgEl as SVGSVGElement, activeNodeId);
  }, [activeNodeId, rendered]);

  if (!method && !(program && showProgramToggle)) {
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
            if (view === "program") return " — Whole program";
            const suffix = label ?? (name ? `${name}()` : "");
            return suffix ? ` — ${suffix}` : "";
          })()}
        </span>
        <div className="flex items-center gap-2">
          {showProgramToggle && (
            <div className="flex overflow-hidden rounded border border-panel-border" role="group" aria-label="Flowchart view">
              <button
                onClick={() => setView("method")}
                aria-pressed={view === "method"}
                className={`px-2 py-0.5 text-code-sm ${view === "method" ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:text-on-surface"}`}
                title="Show this method's flowchart"
              >
                Method
              </button>
              <button
                onClick={() => setView("program")}
                aria-pressed={view === "program"}
                className={`px-2 py-0.5 text-code-sm ${view === "program" ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant hover:text-on-surface"}`}
                title="Show all classes/methods in one unified diagram with cross-method call edges"
              >
                Whole program
              </button>
            </div>
          )}
          <button
            onClick={toggle}
            aria-pressed={animated}
            className="rounded bg-surface-container-high px-2 py-0.5 text-code-sm text-on-surface hover:text-primary"
            title="Toggle animated flow arrows on the diagram (a traveling dot per edge)"
          >
            {animated ? "Flows: on" : "Flows: off"}
          </button>
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
