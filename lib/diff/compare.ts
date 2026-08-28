import { ComplexityResult } from "@/lib/complexity/analyze";

export type ComplexityDelta = {
  time: { before: string; after: string; verdict: "improved" | "regressed" | "unclear" };
  space: { before: string; after: string; verdict: "improved" | "regressed" | "unclear" };
  summary: string;
};

// Rough ordering used only to guess improved/regressed for the delta badge.
// This is a heuristic display aid, not a formal comparison.
const ORDER = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n\u00B2)", "O(n\u00B3)", "O(2^n)"];

function rank(bigO: string): number {
  const normalized = bigO.replace(/\s+/g, " ").trim();
  const exact = ORDER.findIndex((o) => o === normalized);
  if (exact !== -1) return exact;
  // Fallback: substring match, longest/most-complex match wins so
  // "O(n²)" is never misranked as "O(n)".
  for (let i = ORDER.length - 1; i >= 0; i--) {
    const key = ORDER[i].replace("O(", "").replace(")", "");
    if (normalized.includes(key)) return i;
  }
  return ORDER.length;
}

function verdict(before: string, after: string): "improved" | "regressed" | "unclear" {
  const b = rank(before);
  const a = rank(after);
  if (b === ORDER.length || a === ORDER.length) return "unclear";
  if (a < b) return "improved";
  if (a > b) return "regressed";
  return "unclear";
}

export function diffComplexity(before: ComplexityResult, after: ComplexityResult): ComplexityDelta {
  const timeVerdict = verdict(before.time.bigO, after.time.bigO);
  const spaceVerdict = verdict(before.space.bigO, after.space.bigO);

  return {
    time: { before: before.time.bigO, after: after.time.bigO, verdict: timeVerdict },
    space: { before: before.space.bigO, after: after.space.bigO, verdict: spaceVerdict },
    summary: `Time: ${before.time.bigO} \u2192 ${after.time.bigO} (${timeVerdict}). Space: ${before.space.bigO} \u2192 ${after.space.bigO} (${spaceVerdict}).`,
  };
}
