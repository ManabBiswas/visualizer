// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildQuizPrompt, MAX_DRAFT_COUNT, MIN_DRAFT_COUNT, MAX_SOURCE_EXCERPT_CHARS } from "./prompt";
import type { ProgramIR } from "@/lib/ir";

const ir: ProgramIR = {
  classes: [
    {
      name: "Solution",
      methods: [
        {
          name: "mergeSort",
          signature: "int[] mergeSort(int[] arr, int lo, int hi)",
          params: [],
          returnType: "int[]",
          startLine: 3,
          endLine: 9,
          body: [
            { type: "loop", kind: "for", line: 5, endLine: 7, boundType: "input-dependent", body: [] },
            { type: "call", line: 6, target: "merge", args: "a, b", isRecursive: false },
          ],
          calls: ["merge", "mergeSort"],
          comments: [],
        },
      ],
    },
  ],
};

const analyses = [
  { method_name: "mergeSort", time_complexity: "n log n", space_complexity: "n" },
];

const meta = { name: "Merge Sort", difficulty: "Medium", topicTags: ["DP", "Array"] };

describe("buildQuizPrompt", () => {
  it("grounds the prompt in analyzer facts", () => {
    const { system, user } = buildQuizPrompt(meta, ir, analyses, "class Solution {}", 5);
    expect(user).toContain("Merge Sort");
    expect(user).toContain("Difficulty: Medium");
    expect(user).toContain("Topics: DP, Array");
    expect(user).toContain("int[] mergeSort(int[] arr, int lo, int hi) (lines 3–9");
    expect(user).toContain("for (bound: input-dependent) at lines 5");
    expect(user).toContain("calls: merge, mergeSort");
    expect(user).toContain("recursion: YES");
    expect(user).toContain("analyzer time: n log n");
    expect(user).toContain("analyzer space: n");
  });

  it("demands strict JSON output shape", () => {
    const { system } = buildQuizPrompt(meta, ir, analyses, "class Solution {}", 5);
    expect(system).toContain("ONLY a JSON array");
    expect(system).toContain('"question"');
    expect(system).toContain('"answer"');
    expect(system).toContain('"line"');
    expect(system).toContain("no markdown fences");
  });

  it("clamps the requested count into the 3-10 range", () => {
    expect(buildQuizPrompt(meta, ir, analyses, "x", 1).user).toContain("exactly 3 quiz cards");
    expect(buildQuizPrompt(meta, ir, analyses, "x", 99).user).toContain(`exactly ${MAX_DRAFT_COUNT} quiz cards`);
    expect(buildQuizPrompt(meta, ir, analyses, "x", 7).user).toContain("exactly 7 quiz cards");
    // The exported bounds match the drawer slider.
    expect(MIN_DRAFT_COUNT).toBe(3);
    expect(MAX_DRAFT_COUNT).toBe(10);
  });

  it("truncates long sources at a line boundary with a marker", () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `int x${i} = ${i}; // ${"a".repeat(20)}`);
    const longSource = lines.join("\n");
    expect(longSource.length).toBeGreaterThan(MAX_SOURCE_EXCERPT_CHARS);
    const { user } = buildQuizPrompt(meta, ir, analyses, longSource, 5);
    const excerptStart = user.indexOf("```java\n") + "```java\n".length;
    const excerptEnd = user.indexOf("\n```", excerptStart);
    const excerpt = user.slice(excerptStart, excerptEnd);
    expect(excerpt.length).toBeLessThanOrEqual(MAX_SOURCE_EXCERPT_CHARS + 50);
    expect(excerpt.endsWith("// …(truncated)")).toBe(true);
    // Truncation landed on a line boundary (no mid-line cut).
    expect(lines.some((l) => excerpt.startsWith(l))).toBe(true);
  });

  it("keeps short sources intact", () => {
    const short = "class A { void m() {} }";
    const { user } = buildQuizPrompt(meta, ir, analyses, short, 5);
    expect(user).toContain(short);
    expect(user).not.toContain("(truncated)");
  });

  it("omits absent metadata instead of emitting empty labels", () => {
    const { user } = buildQuizPrompt(
      { name: "", difficulty: null, topicTags: [] },
      ir,
      [],
      "class A {}",
      5,
    );
    expect(user).toContain("Problem: (unnamed)");
    expect(user).not.toContain("Difficulty:");
    expect(user).not.toContain("Topics:");
    // No analysis rows -> no analyzer verdict lines.
    expect(user).not.toContain("analyzer time:");
  });

  it("is deterministic — same inputs, same prompt", () => {
    const a = buildQuizPrompt(meta, ir, analyses, "class A {}", 5);
    const b = buildQuizPrompt(meta, ir, analyses, "class A {}", 5);
    expect(a).toEqual(b);
  });
});
