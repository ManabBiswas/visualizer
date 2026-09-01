"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type View = { x: number; y: number; k: number };

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD = 4;

function clampK(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/**
 * Pan/zoom viewer for large SVG diagrams: drag to pan, wheel to zoom at the
 * cursor, pinch to zoom on touch, Fit to see the whole diagram, 1:1 for
 * native size. Diagrams larger than the viewport auto-fit on load; small ones
 * load at native size.
 */
export function PanZoom({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  // Single-pointer pan gesture (drag with one finger/mouse).
  const gesture = useRef<{ pointerId: number; startX: number; startY: number; viewX: number; viewY: number; moved: boolean } | null>(null);
  // Two-pointer pinch gesture: zoom anchored at the midpoint.
  const pinch = useRef<{ p1: number; p2: number; startDist: number; startK: number; cx: number; cy: number } | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());

  const measureContent = useCallback((): { w: number; h: number } | null => {
    const svg = contentRef.current?.querySelector("svg");
    if (!svg) return null;
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height };
    const w = parseFloat(svg.getAttribute("width") ?? "");
    const h = parseFloat(svg.getAttribute("height") ?? "");
    if (w > 0 && h > 0) return { w, h };
    const rect = svg.getBoundingClientRect();
    return rect.width > 0 ? { w: rect.width, h: rect.height } : null;
  }, []);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const size = measureContent();
    if (!container || !size) return;
    const pad = 24;
    const cw = container.clientWidth - pad * 2;
    const ch = container.clientHeight - pad * 2;
    if (cw <= 0 || ch <= 0) return;
    const k = clampK(Math.min(cw / size.w, ch / size.h, 1));
    setView({ x: (container.clientWidth - size.w * k) / 2, y: pad + Math.max(0, (ch - size.h * k) / 2), k });
  }, [measureContent]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mx = cx ?? rect.width / 2;
    const my = cy ?? rect.height / 2;
    setView((v) => {
      const k = clampK(v.k * factor);
      const ratio = k / v.k;
      return { k, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio };
    });
  }, []);

  // When a new diagram is injected: load at 100% (1:1) anchored at the padding
  // offset. Users can hit "Fit" if they want the whole diagram on screen.
  // We previously auto-fit overflowing diagrams, but a shrunken flowchart
  // reads worse than a pannable one — power users have a Fit button.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setView({ x: 24, y: 24, k: 1 });
      }, 30);
    };
    const observer = new MutationObserver(reset);
    observer.observe(content, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  // Wheel zoom needs a non-passive listener to prevent page scroll.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      activePointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    (e.target as Element).setPointerCapture?.(e.pointerId);

    // Second finger down: upgrade to a pinch gesture.
    if (activePointers.current.size === 2) {
      const [a, b] = [...activePointers.current.values()];
      const startDist = Math.hypot(a.x - b.x, a.y - b.y);
      if (startDist > 0) {
        gesture.current = null;
        setDragging(false);
        pinch.current = {
          p1: [...activePointers.current.keys()][0],
          p2: [...activePointers.current.keys()][1],
          startDist,
          startK: view.k,
          cx: (a.x + b.x) / 2,
          cy: (a.y + b.y) / 2,
        };
      }
      return;
    }

    if (activePointers.current.size > 1) return;
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      viewX: view.x,
      viewY: view.y,
      moved: false,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    // Track pointer positions for pinch gestures.
    if (activePointers.current.has(e.pointerId)) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        activePointers.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }

    // Pinch zoom: scale from the gesture's start, anchored at the midpoint.
    const p = pinch.current;
    if (p && activePointers.current.size >= 2) {
      const a = activePointers.current.get(p.p1);
      const b = activePointers.current.get(p.p2);
      if (a && b) {
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (p.startDist > 0 && dist > 0) {
          const k = clampK(p.startK * (dist / p.startDist));
          setView((v) => {
            const ratio = k / v.k;
            return { k, x: p.cx - (p.cx - v.x) * ratio, y: p.cy - (p.cy - v.y) * ratio };
          });
        }
      }
      return;
    }

    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!g.moved) {
      g.moved = true;
      setDragging(true);
    }
    setView((v) => ({ ...v, x: g.viewX + dx, y: g.viewY + dy }));
  }

  function onPointerUp(e: React.PointerEvent) {
    activePointers.current.delete(e.pointerId);
    if (pinch.current && (e.pointerId === pinch.current.p1 || e.pointerId === pinch.current.p2)) {
      pinch.current = null;
    }
    if (gesture.current?.pointerId === e.pointerId) {
      gesture.current = null;
      setDragging(false);
    }
  }

  const pct = Math.round(view.k * 100);

  return (
    <div
      ref={containerRef}
      style={{ touchAction: "none" }}
      className={`relative h-full w-full overflow-hidden bg-surface ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={contentRef}
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transformOrigin: "0 0",
          width: "max-content",
        }}
      >
        {children}
      </div>

      <div className="absolute right-2 top-2 flex items-center gap-1 rounded border border-panel-border bg-surface-container-lowest/90 p-1 shadow">
        <button
          onClick={() => zoomAt(1 / 1.25)}
          className="rounded px-2 py-0.5 font-mono text-code-md text-on-surface hover:bg-surface-container-high"
          title="Zoom out"
          aria-label="Zoom out"
        >
          −
        </button>
        <span className="min-w-12 text-center font-mono text-code-sm text-text-muted">{pct}%</span>
        <button
          onClick={() => zoomAt(1.25)}
          className="rounded px-2 py-0.5 font-mono text-code-md text-on-surface hover:bg-surface-container-high"
          title="Zoom in"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={fit}
          className="rounded px-2 py-0.5 text-body-sm text-on-surface hover:bg-surface-container-high"
          title="Fit diagram to screen"
        >
          Fit
        </button>
        <button
          onClick={() => setView({ x: 24, y: 24, k: 1 })}
          className="rounded px-2 py-0.5 text-body-sm text-on-surface hover:bg-surface-container-high"
          title="Reset to 100% (native size)"
        >
          100%
        </button>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-surface-container-lowest/80 px-2 py-0.5 text-code-sm text-text-muted">
        drag to pan · scroll or pinch to zoom · hover a node for details · click to jump to its line
      </div>
    </div>
  );
}
