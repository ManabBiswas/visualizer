// @vitest-environment node
// Sample sources flow straight into the parser + analyzer on the marketing
// CTA path — they must parse cleanly, produce meaningful results, and carry
// the tagged comments that power the notes/quiz loop.
import { describe, expect, it } from "vitest";
import { SAMPLES, findSample } from "./samples";
import { parseJavaTs } from "@/lib/parser/javaTs";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { extractCommentTags, attachTagsToMethods } from "@/lib/notes/extract";

describe("SAMPLES", () => {
  const methodsOf = (source: string) => parseJavaTs(source).classes.flatMap((c) => c.methods);

  it("has five samples with unique ids and metadata", () => {
    expect(SAMPLES).toHaveLength(5);
    const ids = new Set(SAMPLES.map((s) => s.id));
    expect(ids.size).toBe(SAMPLES.length);
    for (const s of SAMPLES) {
      expect(s.name).toBeTruthy();
      expect(s.link.startsWith("https://leetcode.com/")).toBe(true);
      expect(["Easy", "Medium", "Hard"]).toContain(s.difficulty);
      expect(s.topicTags.length).toBeGreaterThan(0);
      expect(s.blurb).toBeTruthy();
    }
  });

  it("findSample resolves by id and rejects unknown ids", () => {
    expect(findSample("two-sum")?.name).toBe("Two Sum");
    expect(findSample("nope")).toBeNull();
    expect(findSample(null)).toBeNull();
  });

  it("every sample parses into at least one method", () => {
    for (const s of SAMPLES) {
      const methods = methodsOf(s.source);
      expect(
        methods.length,
        `${s.id}: expected at least one method`
      ).toBeGreaterThan(0);
    }
  });

  it("every sample carries tagged comments for the notes/quiz loop", () => {
    for (const s of SAMPLES) {
      const methods = methodsOf(s.source);
      const tags = extractCommentTags(s.source.split("\n"));
      const tagged = attachTagsToMethods(methods, tags);
      const anyTagged = tagged.some((m) => m.comments.length > 0);
      expect(
        anyTagged,
        `${s.id}: no // q: / // note: / // why: comments found`
      ).toBe(true);
    }
  });

  it("every sample produces a complexity verdict", () => {
    for (const s of SAMPLES) {
      for (const m of methodsOf(s.source)) {
        const c = analyzeComplexity(m);
        expect(
          c.time.bigO,
          `${s.id}/${m.name}: expected a time verdict`
        ).toBeTruthy();
      }
    }
  });

  it("exercises distinct analysis patterns across the set", () => {
    const byId = (id: string) => methodsOf(SAMPLES.find((s) => s.id === id)!.source);
    // Multi-method call graphs in merge sort + islands.
    expect(byId("merge-sort").length).toBeGreaterThanOrEqual(3);
    expect(byId("bfs-graph").length).toBeGreaterThanOrEqual(2);
    // Single-method samples stay single.
    expect(byId("binary-search")).toHaveLength(1);
    expect(byId("two-sum")).toHaveLength(1);
    expect(byId("valid-parentheses")).toHaveLength(1);
    // Recursion detected in merge sort (self-call edge in the call list).
    expect(byId("merge-sort").some((m) => m.calls.includes(m.name))).toBe(true);
    // Switch statement visible in valid-parentheses (flowchart decision).
    expect(
      byId("valid-parentheses").some((m) =>
        JSON.stringify(m.body).includes('"switch"')
      )
    ).toBe(true);
  });
});
