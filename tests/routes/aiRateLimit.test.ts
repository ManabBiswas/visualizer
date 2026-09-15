// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { callRoute, createTestDb, useTestDb, sessionCookies } from "./harness";

// The AI drafting route's rate limit must be keyed on the SESSION user
// (audit Rev 5 follow-up): X-Forwarded-For is client-controlled behind
// Vercel's proxy, so an IP-keyed limit on an auth-required route could be
// bypassed by rotating the header.

const TIMEOUT = 30000;
const LIMIT = 5; // matches RATE_LIMIT_PER_MINUTE in the route

let aliceCookies: { "authjs.session-token": string };
let bobCookies: { "authjs.session-token": string };

beforeAll(async () => {
  await useTestDb(await createTestDb());
  aliceCookies = await sessionCookies({ githubId: "ai-rate-1", login: "ai-rate-alice" });
  bobCookies = await sessionCookies({ githubId: "ai-rate-2", login: "ai-rate-bob" });
}, 60000);

describe("POST /api/ai/quiz rate limiting", () => {
  it("limits per user, not per IP — header rotation cannot bypass it", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/ai/quiz/route");

    // Alice burns her budget with 5 requests, each carrying a DIFFERENT
    // spoofed X-Forwarded-For (the old bypass). Under user-keyed limits
    // these all hit the same bucket; body validation failures (400) still
    // consume the budget because the limit check runs first.
    for (let i = 0; i < LIMIT; i++) {
      const res = await callRoute(POST, "/api/ai/quiz", {
        method: "POST",
        cookies: aliceCookies,
        headers: { "x-forwarded-for": `10.0.0.${i + 1}` },
        body: JSON.stringify({ problemId: "!!!" }), // fails validation later
      });
      expect(res.status).toBe(400); // invalid problemId — but the hit counted
    }

    // 6th request from the same user (yet another fresh IP): 429.
    const sixth = await callRoute(POST, "/api/ai/quiz", {
      method: "POST",
      cookies: aliceCookies,
      headers: { "x-forwarded-for": "10.0.0.99" },
      body: JSON.stringify({ problemId: "!!!" }),
    });
    expect(sixth.status).toBe(429);
    expect((sixth.body as { error: string }).error).toContain("Too many AI drafting requests");
  });

  it("a different user has an independent budget", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/ai/quiz/route");
    const res = await callRoute(POST, "/api/ai/quiz", {
      method: "POST",
      cookies: bobCookies,
      headers: { "x-forwarded-for": "10.0.0.1" }, // same IP as alice's first hit
      body: JSON.stringify({ problemId: "!!!" }),
    });
    // Bob is limited by his own (empty) bucket, not alice's or the shared IP.
    expect(res.status).toBe(400);
  });

  it("anonymous requests still 401 before the limit", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/ai/quiz/route");
    const res = await callRoute(POST, "/api/ai/quiz", {
      method: "POST",
      body: JSON.stringify({ problemId: "!!!" }),
    });
    expect(res.status).toBe(401);
  });
});
