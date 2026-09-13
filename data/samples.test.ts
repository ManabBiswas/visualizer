// @vitest-environment node
// Sample sources flow straight into the parser + analyzer on the marketing
// CTA path — they must parse cleanly, produce meaningful results, and carry
// the tagged comments that power the notes/quiz loop.
import { describe, expect, it } from "vitest";
import { SAMPLES, findSample } from "./samples";
import { parseJavaTs } from "@/lib/parser/javaTs";
import { parsePython } from "@/lib/parser/python";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { extractCommentTags, attachTagsToMethods } from "@/lib/notes/extract";

describe("SAMPLES", () => {
  // Language-aware dispatch — same choice /api/analyze makes.
  const methodsOf = async (source: string, language?: string) =>
    (language === "python" ? await parsePython(source) : parseJavaTs(source)).classes.flatMap(
      (c) => c.methods,
    );

  it("has seven samples with unique ids and metadata", () => {
    expect(SAMPLES).toHaveLength(7);
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
    expect(findSample("py-binary-search")?.language).toBe("python");
    expect(findSample("nope")).toBeNull();
    expect(findSample(null)).toBeNull();
  });

  it("every sample parses into at least one method", async () => {
    for (const s of SAMPLES) {
      const methods = await methodsOf(s.source, s.language);
      expect(
        methods.length,
        `${s.id}: expected at least one method`
      ).toBeGreaterThan(0);
    }
  });

  it("every sample carries tagged comments for the notes/quiz loop", async () => {
    for (const s of SAMPLES) {
      const methods = await methodsOf(s.source, s.language);
      const tags = extractCommentTags(s.source.split("\n"));
      const tagged = attachTagsToMethods(methods, tags);
      const anyTagged = tagged.some((m) => m.comments.length > 0);
      expect(
        anyTagged,
        `${s.id}: no // q: / // note: / // why: (or #) comments found`
      ).toBe(true);
    }
  });

  it("every sample produces a complexity verdict", async () => {
    for (const s of SAMPLES) {
      for (const m of await methodsOf(s.source, s.language)) {
        const c = analyzeComplexity(m);
        expect(
          c.time.bigO,
          `${s.id}/${m.name}: expected a time verdict`
        ).toBeTruthy();
      }
    }
  });

  it("exercises distinct analysis patterns across the set", async () => {
    const byId = async (id: string) => {
      const s = SAMPLES.find((x) => x.id === id)!;
      return methodsOf(s.source, s.language);
    };
    // Multi-method call graphs in merge sort + islands.
    expect((await byId("merge-sort")).length).toBeGreaterThanOrEqual(3);
    expect((await byId("bfs-graph")).length).toBeGreaterThanOrEqual(2);
    // Single-method samples stay single.
    expect(await byId("binary-search")).toHaveLength(1);
    expect(await byId("two-sum")).toHaveLength(1);
    expect(await byId("valid-parentheses")).toHaveLength(1);
    // Recursion detected in merge sort (self-call edge in the call list).
    expect((await byId("merge-sort")).some((m) => m.calls.includes(m.name))).toBe(true);
    // Switch statement visible in valid-parentheses (flowchart decision).
    expect(
      (await byId("valid-parentheses")).some((m) =>
        JSON.stringify(m.body).includes('"switch"')
      )
    ).toBe(true);
  });

  it("Python samples hit the Python pipeline with correct verdicts", async () => {
    const bs = await byIdOf("py-binary-search");
    expect(analyzeComplexity(bs[0]).time.bigO).toBe("O(log n)");
    const ts = await byIdOf("py-two-sum");
    expect(analyzeComplexity(ts[0]).time.bigO).toBe("O(n)");
    expect(analyzeComplexity(ts[0]).space.bigO).toBe("O(n)");
  });
});

async function byIdOf(id: string) {
  const s = SAMPLES.find((x) => x.id === id)!;
  return (await parsePython(s.source)).classes.flatMap((c) => c.methods);
}
