// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { easeOutCubic } from "@/lib/useCountUp";

// The animation math is extracted as a pure function so the motion contract
// is testable without a React render loop: monotonic, clamped, endpoints
// exact. The rAF wiring itself is exercised by the app in the browser.

describe("easeOutCubic", () => {
  it("starts exactly at the origin and ends exactly at the target", () => {
    expect(easeOutCubic(0, 10, 0)).toBe(0);
    expect(easeOutCubic(0, 10, 1)).toBe(10);
    expect(easeOutCubic(4, 9, 0)).toBe(4);
    expect(easeOutCubic(4, 9, 1)).toBe(9);
  });

  it("is monotonic (fast start, eased end) for a count-up", () => {
    const steps = Array.from({ length: 11 }, (_, i) => easeOutCubic(0, 100, i / 10));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1]);
    }
    // ease-out: the first half covers more than half the distance
    expect(steps[5]).toBeGreaterThan(50);
  });

  it("supports counting down (shrinking values)", () => {
    expect(easeOutCubic(10, 0, 1)).toBe(0);
    const mid = easeOutCubic(10, 0, 0.5);
    expect(mid).toBeLessThan(10);
    expect(mid).toBeGreaterThan(0);
  });
});
