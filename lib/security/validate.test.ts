import { describe, it, expect } from "vitest";
import {
  sanitizeUrl,
  isSafeHttpUrl,
  stripControlChars,
  validateSource,
  validateProblemMeta,
  isValidId,
  cleanQueryParam,
  MAX_SOURCE_CHARS,
  MAX_NAME_CHARS,
  MAX_TOPIC_TAGS,
} from "./validate";

describe("sanitizeUrl", () => {
  it("allows http and https URLs", () => {
    expect(sanitizeUrl("https://leetcode.com/problems/two-sum")).toBe(
      "https://leetcode.com/problems/two-sum"
    );
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
  });

  it("blocks javascript: URLs (stored XSS vector)", () => {
    expect(sanitizeUrl("javascript:alert(document.cookie)")).toBeNull();
    expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("blocks data:, vbscript:, file: schemes", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects non-strings, empty, oversized, and malformed input", () => {
    expect(sanitizeUrl(null)).toBeNull();
    expect(sanitizeUrl(42)).toBeNull();
    expect(sanitizeUrl("")).toBeNull();
    expect(sanitizeUrl("x".repeat(3000))).toBeNull();
    expect(sanitizeUrl("not a url")).toBeNull();
  });

  it("strips control characters before parsing", () => {
    expect(sanitizeUrl("https://example.com/\u0000path")).toBe("https://example.com/path");
  });
});

describe("isSafeHttpUrl", () => {
  it("matches sanitizeUrl behavior for rendering guards", () => {
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
  });
});

describe("stripControlChars", () => {
  it("removes control characters but keeps newlines and tabs", () => {
    expect(stripControlChars("a\u0000b\u0007c")).toBe("abc");
    expect(stripControlChars("line1\nline2\ttab")).toBe("line1\nline2\ttab");
  });
});

describe("validateSource", () => {
  it("accepts normal Java source", () => {
    const result = validateSource("class A { void f() {} }");
    expect(result.ok).toBe(true);
  });

  it("rejects missing, non-string, and whitespace-only source", () => {
    expect(validateSource(undefined).ok).toBe(false);
    expect(validateSource(123).ok).toBe(false);
    expect(validateSource("   \n  ").ok).toBe(false);
  });

  it("rejects oversized source (DoS bound)", () => {
    const result = validateSource("a".repeat(MAX_SOURCE_CHARS + 1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("too large");
  });

  it("rejects null bytes", () => {
    expect(validateSource("class A {}\u0000").ok).toBe(false);
  });
});

describe("validateProblemMeta", () => {
  it("returns null value when metadata is absent (saving is optional)", () => {
    const result = validateProblemMeta(undefined);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("cleans and normalizes valid metadata", () => {
    const result = validateProblemMeta({
      name: "  Two Sum  ",
      link: "https://leetcode.com/problems/two-sum",
      topicTags: ["Array", " Array ", "Hash Map", ""],
      difficulty: "Easy",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.name).toBe("Two Sum");
      expect(result.value.link).toBe("https://leetcode.com/problems/two-sum");
      expect(result.value.topicTags).toEqual(["Array", "Hash Map"]);
      expect(result.value.difficulty).toBe("Easy");
    }
  });

  it("rejects javascript: links", () => {
    const result = validateProblemMeta({ name: "x", link: "javascript:alert(1)" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("http(s)");
  });

  it("rejects oversized names", () => {
    const result = validateProblemMeta({ name: "n".repeat(MAX_NAME_CHARS + 1) });
    expect(result.ok).toBe(false);
  });

  it("rejects too many topic tags and non-string tags", () => {
    const tooMany = validateProblemMeta({
      name: "x",
      topicTags: Array.from({ length: MAX_TOPIC_TAGS + 1 }, (_, i) => `t${i}`),
    });
    expect(tooMany.ok).toBe(false);
    expect(validateProblemMeta({ name: "x", topicTags: ["ok", 123] }).ok).toBe(false);
    expect(validateProblemMeta({ name: "x", topicTags: "Array" }).ok).toBe(false);
  });

  it("rejects invalid difficulty values", () => {
    expect(validateProblemMeta({ name: "x", difficulty: "Extreme" }).ok).toBe(false);
    const empty = validateProblemMeta({ name: "x", difficulty: "" });
    expect(empty.ok).toBe(true);
    if (empty.ok && empty.value) expect(empty.value.difficulty).toBeNull();
  });

  it("treats whitespace-only names as no-save instead of an error", () => {
    const result = validateProblemMeta({ name: "   " });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it("rejects non-object metadata", () => {
    expect(validateProblemMeta("problem").ok).toBe(false);
    expect(validateProblemMeta(["a"]).ok).toBe(false);
  });
});

describe("isValidId", () => {
  it("accepts uuid-like ids", () => {
    expect(isValidId("3f2b1a90-1234-4abc-9def-0123456789ab")).toBe(true);
    expect(isValidId("abc_DEF-123")).toBe(true);
  });

  it("rejects path traversal and injection attempts", () => {
    expect(isValidId("../etc/passwd")).toBe(false);
    expect(isValidId("a; DROP TABLE problems")).toBe(false);
    expect(isValidId("id%00")).toBe(false);
    expect(isValidId("")).toBe(false);
    expect(isValidId("x".repeat(65))).toBe(false);
  });
});

describe("cleanQueryParam", () => {
  it("trims, bounds, and strips control characters", () => {
    expect(cleanQueryParam("  DP  ")).toBe("DP");
    expect(cleanQueryParam("a\u0000b")).toBe("ab");
    expect(cleanQueryParam("x".repeat(200))).toHaveLength(50);
    expect(cleanQueryParam(null)).toBeNull();
    expect(cleanQueryParam("   ")).toBeNull();
  });
});
