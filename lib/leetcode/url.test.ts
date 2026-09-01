// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseLeetCodeUrl, questionToMeta, type LeetCodeQuestion } from "./url";

describe("parseLeetCodeUrl", () => {
  it("extracts the slug from canonical problem URLs", () => {
    expect(parseLeetCodeUrl("https://leetcode.com/problems/two-sum/")).toBe("two-sum");
    expect(parseLeetCodeUrl("https://leetcode.com/problems/two-sum")).toBe("two-sum");
    expect(parseLeetCodeUrl("http://www.leetcode.com/problems/binary-search/description/")).toBe(
      "binary-search"
    );
    expect(parseLeetCodeUrl("https://leetcode.com/problems/merge-k-sorted-lists/?env=study-plan")).toBe(
      "merge-k-sorted-lists"
    );
  });

  it("rejects non-problem paths on leetcode.com", () => {
    expect(parseLeetCodeUrl("https://leetcode.com/explore/")).toBeNull();
    expect(parseLeetCodeUrl("https://leetcode.com/contest/")).toBeNull();
    expect(parseLeetCodeUrl("https://leetcode.com/")).toBeNull();
    expect(parseLeetCodeUrl("https://leetcode.com/problems/")).toBeNull();
  });

  it("rejects other hosts (SSRF guard), empty and malformed input", () => {
    expect(parseLeetCodeUrl("https://evil.com/problems/two-sum/")).toBeNull();
    expect(parseLeetCodeUrl("https://leetcode.com.evil.com/problems/two-sum/")).toBeNull();
    expect(parseLeetCodeUrl("https://leetcode.com@evil.com/problems/two-sum/")).toBeNull();
    expect(parseLeetCodeUrl("javascript:alert(1)")).toBeNull();
    expect(parseLeetCodeUrl("")).toBeNull();
    expect(parseLeetCodeUrl("not a url")).toBeNull();
  });

  it("normalizes slug case", () => {
    expect(parseLeetCodeUrl("https://leetcode.com/problems/Two-Sum/")).toBe("two-sum");
  });
});

describe("questionToMeta", () => {
  it("maps a full question payload to ProblemMeta", () => {
    const q: LeetCodeQuestion = {
      title: "Two Sum",
      titleSlug: "two-sum",
      difficulty: "Easy",
      topicTags: [{ name: "Array" }, { name: "Hash Table" }],
    };
    expect(questionToMeta(q)).toEqual({
      name: "Two Sum",
      link: "https://leetcode.com/problems/two-sum/",
      topicTags: ["Array", "Hash Map"],
      difficulty: "Easy",
    });
  });

  it("keeps unmapped tags as-is (free-form downstream)", () => {
    const q: LeetCodeQuestion = {
      title: "Alien Dictionary",
      titleSlug: "alien-dictionary",
      difficulty: "Hard",
      topicTags: [{ name: "Topological Sort" }, { name: "Depth-First Search" }],
    };
    const meta = questionToMeta(q)!;
    expect(meta.topicTags).toEqual(["Topological Sort", "Graph"]);
    expect(meta.difficulty).toBe("Hard");
  });

  it("returns null for missing title or slug", () => {
    expect(questionToMeta({ title: "", titleSlug: "x", difficulty: "Easy" })).toBeNull();
    expect(questionToMeta({ title: "X", titleSlug: "", difficulty: "Easy" })).toBeNull();
    expect(questionToMeta({})).toBeNull();
  });

  it("drops an out-of-taxonomy difficulty instead of failing", () => {
    const q: LeetCodeQuestion = { title: "X", titleSlug: "x", difficulty: "Super" };
    expect(questionToMeta(q)?.difficulty).toBe("");
  });

  it("caps tags at 8 and dedupes after mapping", () => {
    const q: LeetCodeQuestion = {
      title: "X",
      titleSlug: "x",
      difficulty: "Easy",
      topicTags: Array.from({ length: 12 }, (_, i) => ({ name: `Tag ${i}` })),
    };
    const meta = questionToMeta(q)!;
    expect(meta.topicTags).toHaveLength(8);
    // Hash Table + Depth-First Search both map into existing entries -> deduped
    const q2: LeetCodeQuestion = {
      title: "X",
      titleSlug: "x",
      difficulty: "Easy",
      topicTags: [
        { name: "Hash Table" },
        { name: "Hash Table" },
        { name: "Breadth-First Search" },
        { name: "Depth-First Search" },
      ],
    };
    expect(questionToMeta(q2)!.topicTags).toEqual(["Hash Map", "Graph"]);
  });
});
