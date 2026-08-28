import { describe, it, expect } from "vitest";
import { extractCommentTags, attachTagsToMethods } from "./extract";
import { MethodIR } from "@/lib/ir";

describe("extractCommentTags", () => {
  it("extracts standalone tagged comment lines", () => {
    const tags = extractCommentTags(["// q: why binary search?", "int x = 1;"]);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ line: 1, tag: "q", text: "why binary search?" });
  });

  it("extracts trailing inline comments after code", () => {
    const tags = extractCommentTags(["int mid = lo + (hi - lo) / 2; // why: avoid overflow"]);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ line: 1, tag: "why", text: "avoid overflow" });
  });

  it("does not match URLs", () => {
    const tags = extractCommentTags(["// see https://q: example.com for details"]);
    expect(tags.filter((t) => t.tag === "q" && t.text.startsWith("example.com"))).toHaveLength(0);
  });

  it("supports all four tag types case-insensitively", () => {
    const tags = extractCommentTags(["// Q: a", "// NOTE: b", "// Why: c", "// COMPLEXITY: d"]);
    expect(tags.map((t) => t.tag)).toEqual(["q", "note", "why", "complexity"]);
  });

  it("ignores untagged comments", () => {
    const tags = extractCommentTags(["// just a comment", "int y = 2; // plain trailing"]);
    expect(tags).toHaveLength(0);
  });
});

describe("attachTagsToMethods", () => {
  const method = (name: string, startLine: number, endLine: number): MethodIR => ({
    name,
    signature: name,
    params: [],
    returnType: "void",
    startLine,
    endLine,
    body: [],
    calls: [],
    comments: [],
  });

  it("attaches tags inside the method and directly above it", () => {
    const tags = extractCommentTags([
      "// note: describes the method below",
      "void a() {",
      "// q: inside a",
      "}",
      "// note: after the method, belongs to nothing yet",
    ]);
    const [attached] = attachTagsToMethods([method("a", 2, 4)], tags);
    expect(attached.comments.map((c) => c.text)).toEqual([
      "describes the method below",
      "inside a",
    ]);
  });

  it("attributes tags between two methods to the second one", () => {
    const tags = extractCommentTags([
      "void a() {",
      "}",
      "// why: explains b",
      "void b() {",
      "}",
    ]);
    const [a, b] = attachTagsToMethods([method("a", 1, 2), method("b", 4, 5)], tags);
    expect(a.comments).toHaveLength(0);
    expect(b.comments.map((c) => c.text)).toEqual(["explains b"]);
  });
});
