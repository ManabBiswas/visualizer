// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { callRoute, createTestDb, useTestDb, sessionCookies, currentTestDb } from "./harness";

// Interview mode uses /api/quiz internally; test the weighted selection logic
// by verifying the API returns cards that can be used for interview sessions

const TIMEOUT = 30000;

let cookies: { "next-auth.session-token": string };
let problemId: string;

beforeAll(async () => {
  await useTestDb(await createTestDb());
  cookies = await sessionCookies({ githubId: "interview-test-1", login: "interview-test" });

  const { POST } = await import("@/app/api/analyze/route");
  const res = await callRoute(POST, "/api/analyze", {
    method: "POST",
    cookies,
    body: JSON.stringify({
      source: `public class Main {
  // q: what is the loop invariant here?
  // note: single pass accumulates into a[0]
  public static int solve(int[] a) {
    for (int i = 0; i < a.length; i++) { a[0] += a[i]; }
    return a[0];
  }
}`,
      problem: { name: "Interview Test Problem", topicTags: ["Arrays"], difficulty: "Easy" },
    }),
  });
  const body = res.body as { savedProblemId: string | null; saveWarning: string | null };
  expect(body.saveWarning).toBeNull();
  problemId = body.savedProblemId!;
}, 120000);

describe("Interview mode — /api/quiz provides cards for interview sessions", () => {
  it("returns cards with lapse_count and ease_factor for weighted selection", async () => {
    const { GET } = await import("@/app/api/quiz/route");
    const res = await callRoute(GET, "/api/quiz", {
      method: "GET",
      cookies,
    });
expect(res.status).toBe(200);
     const cards = (res.body as { cards: any[] }).cards;
     expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThan(0);
    
    // Verify card structure has fields needed for interview weighting
    const card = cards[0];
    expect(card).toHaveProperty("lapseCount");
    expect(card).toHaveProperty("state");
    if (card.state) {
      expect(card.state).toHaveProperty("easeFactor");
    }
  });

it("supports problem filter for scoped interview sessions", async () => {
const { GET } = await import("@/app/api/quiz/route");
      const res = await callRoute(GET, `/api/quiz?problem=${problemId}`, {
        method: "GET",
        cookies,
      });
     expect(res.status).toBe(200);
     const cards = (res.body as { cards: any[] }).cards;
     for (const card of cards) {
       expect((card as { problemId: string }).problemId).toBe(problemId);
     }
   });

it("supports topic filter for topic-specific interview sessions", async () => {
     const { GET } = await import("@/app/api/quiz/route");
     const res = await callRoute(GET, "/api/quiz?topic=Arrays", {
       method: "GET",
       cookies,
     });
     expect(res.status).toBe(200);
     const cards = (res.body as { cards: any[] }).cards;
     for (const card of cards) {
       expect((card as { topics: string[] }).topics).toContain("Arrays");
     }
   });

  it("supports focus=weakest for weak-topic drill (reuses existing logic)", async () => {
    const { GET } = await import("@/app/api/quiz/route");
    const res = await callRoute(GET, "/api/quiz?focus=weakest", {
      method: "GET",
      cookies,
});
     expect(res.status).toBe(200);
     const body = res.body as { cards: unknown[]; focus?: string[] };
     // focus is returned when weak topics contribute cards; may be empty array if no weak topics
     expect(body.focus).toBeDefined();
     expect(Array.isArray(body.focus)).toBe(true);
  });
});
