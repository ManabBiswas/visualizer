import { describe, it, expect } from "vitest";
import { diffComplexity } from "./compare";
import { ComplexityResult } from "@/lib/complexity/analyze";

function result(time: string, space = "O(1)"): ComplexityResult {
  return {
    time: { bigO: time, confidence: "High", explanation: "" },
    space: { bigO: space, confidence: "High", explanation: "" },
  };
}

describe("diffComplexity", () => {
  it("detects improvement", () => {
    const delta = diffComplexity(result("O(n\u00B2)"), result("O(n log n)"));
    expect(delta.time.verdict).toBe("improved");
  });

  it("detects regression", () => {
    const delta = diffComplexity(result("O(n)"), result("O(n\u00B2)"));
    expect(delta.time.verdict).toBe("regressed");
  });

  it("reports unclear for unknown shapes", () => {
    const delta = diffComplexity(result("O(n!)"), result("O(n)"));
    expect(delta.time.verdict).toBe("unclear");
  });

  it("summarizes both dimensions", () => {
    const delta = diffComplexity(result("O(n\u00B2)", "O(n)"), result("O(n)", "O(1)"));
    expect(delta.summary).toContain("Time");
    expect(delta.summary).toContain("Space");
  });
});
