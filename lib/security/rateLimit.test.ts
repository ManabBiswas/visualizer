import { describe, it, expect, beforeEach } from "vitest";
import {
  isRateLimitedSync,
  tryAcquireParserSlot,
  releaseParserSlot,
  activeParserCount,
  resetSecurityState,
} from "./rateLimit";

beforeEach(() => {
  resetSecurityState();
});

describe("isRateLimitedSync", () => {
  it("allows calls under the limit and blocks after", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(isRateLimitedSync("ip1", 5, 60_000, now + i)).toBe(false);
    }
    expect(isRateLimitedSync("ip1", 5, 60_000, now + 10)).toBe(true);
  });

  it("tracks keys independently", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) isRateLimitedSync("ip1", 5, 60_000, now);
    expect(isRateLimitedSync("ip2", 5, 60_000, now)).toBe(false);
  });

  it("frees budget after the window expires", () => {
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) isRateLimitedSync("ip1", 5, 60_000, now);
    expect(isRateLimitedSync("ip1", 5, 60_000, now + 61_000)).toBe(false);
  });
});

describe("parser concurrency slots", () => {
  it("enforces the concurrency cap until released", () => {
    expect(tryAcquireParserSlot(2)).toBe(true);
    expect(tryAcquireParserSlot(2)).toBe(true);
    expect(tryAcquireParserSlot(2)).toBe(false);
    expect(activeParserCount()).toBe(2);
    releaseParserSlot();
    expect(tryAcquireParserSlot(2)).toBe(true);
  });

  it("never goes below zero", () => {
    releaseParserSlot();
    releaseParserSlot();
    expect(activeParserCount()).toBe(0);
  });
});
