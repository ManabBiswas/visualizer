// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateShareSlug, isValidShareSlug, SHARE_SLUG_LENGTH } from "./slug";

describe("generateShareSlug", () => {
  it("produces a 12-char base62 slug", () => {
    const slug = generateShareSlug();
    expect(slug).toHaveLength(SHARE_SLUG_LENGTH);
    expect(/^[a-zA-Z0-9]+$/.test(slug)).toBe(true);
  });

  it("produces distinct slugs across calls (randomness sanity)", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateShareSlug()));
    expect(seen.size).toBe(200);
  });
});

describe("isValidShareSlug", () => {
  it("accepts a well-formed slug", () => {
    expect(isValidShareSlug(generateShareSlug())).toBe(true);
    expect(isValidShareSlug("abc123ABC456")).toBe(true);
  });

  it("rejects wrong length, non-base62, and non-strings", () => {
    expect(isValidShareSlug("short")).toBe(false);
    expect(isValidShareSlug("a".repeat(13))).toBe(false);
    expect(isValidShareSlug("")).toBe(false);
    expect(isValidShareSlug("abc123/4567")).toBe(false);
    expect(isValidShareSlug("abc 123ABC4")).toBe(false);
    expect(isValidShareSlug("abc123ABC45%")).toBe(false);
    expect(isValidShareSlug(null)).toBe(false);
    expect(isValidShareSlug(123456789012)).toBe(false);
    expect(isValidShareSlug({ slug: "abc123ABC456" })).toBe(false);
  });
});
