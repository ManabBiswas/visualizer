"use client";

import { useEffect, useRef, useState } from "react";

// Count-up animation for dashboard stat numbers: animates from 0 (or the
// previous value) to the target over ~800ms with an ease-out curve, driven by
// requestAnimationFrame. No animation library needed — this is the only
// scroll/entrance effect in the app, and it respects prefers-reduced-motion
// by jumping straight to the final value.

const DURATION_MS = 800;

/** Pure ease-out cubic interpolation — exported for tests. */
export function easeOutCubic(from: number, to: number, t: number): number {
  const eased = 1 - Math.pow(1 - t, 3);
  return from + (to - from) * eased;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Returns the currently displayed value for a target number. Animates on
 * every target change; mounts straight at the target when reduced motion is
 * preferred. Integer targets animate as integers (no fractional flicker).
 */
export function useCountUp(target: number): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    // Reduced motion: jump straight to the target, but still via a callback
    // (not synchronous setState inside the effect body) to avoid cascading
    // renders flagged by the React compiler lint.
    if (prefersReducedMotion()) {
      const jump = () => {
        fromRef.current = target;
        setDisplay(target);
      };
      const raf = requestAnimationFrame(jump);
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();

    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const value = from + (target - from) * eased;
      setDisplay(Number.isInteger(target) ? Math.round(value) : value);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}
