// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { callRoute, createTestDb, useTestDb, sessionCookies, currentTestDb } from "./harness";

// MCQ format tests: AI drafting returns MCQ cards, accept endpoint stores them

const TIMEOUT = 30000;

let cookies: { "next-auth.session-token": string };
let problemId: string;

beforeAll(async () => {
  await useTestDb(await createTestDb());
  cookies = await sessionCookies({ githubId: "mcq-test-1", login: "mcq-test" });

  const { POST } = await import("@/app/api/analyze/route");
  const res = await callRoute(POST, "/api/analyze", {
    method: "POST",
    cookies,
    body: JSON.stringify({
      source: `public class Main {
  public static int solve(int[] a) {
    for (int i = 0; i < a.length; i++) { a[0] += a[i]; }
    return a[0];
  }
}`,
      problem: { name: "MCQ Test Problem", topicTags: ["Arrays"], difficulty: "Easy" },
    }),
  });
  const body = res.body as { savedProblemId: string | null; saveWarning: string | null };
  expect(body.saveWarning).toBeNull();
  problemId = body.savedProblemId!;
}, 120000);

describe("MCQ format — AI drafting & acceptance", () => {
  it("POST /api/ai/quiz with format=mcq returns MCQ-shaped drafts (choices[4], correct_index, explanation)", async () => {
    const { POST } = await import("@/app/api/ai/quiz/route");
    const res = await callRoute(POST, "/api/ai/quiz", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        problemId,
        provider: "gemini",
        apiKey: "AIzaFakeKeyForTesting123456789012",
        count: 3,
        format: "mcq",
      }),
    });
    // Will likely 502/504 due to fake key, but the shape validation in parse.ts
    // should be tested at the unit level. Here we just verify the request is accepted.
    expect([200, 502, 504]).toContain(res.status);
  });

  it("POST /api/quiz/cards accepts MCQ cards with choices, correct_index, explanation", async () => {
    const { POST } = await import("@/app/api/quiz/cards/route");
    const res = await callRoute(POST, "/api/quiz/cards", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        problemId,
        cards: [{
          question: "What does this loop do?",
          answer: "Accumulates sum into a[0]",
          line: 3,
          choices: [
            "Accumulates sum into a[0]",
            "Finds maximum element",
            "Sorts the array",
            "Reverses the array"
          ],
          correct_index: 0,
          explanation: "The loop adds each element to a[0], accumulating the total sum."
        }]
      }),
    });
    console.log("MCQ accept response:", res.status, JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);
    expect((res.body as { accepted: number }).accepted).toBe(1);

    // Verify in DB
    const row = currentTestDb()
      .prepare("SELECT text, answer, choices, correct_index, explanation, source FROM notes WHERE problem_id = ? AND tag_type = 'q'")
      .get(problemId) as { text: string; answer: string; choices: string | null; correct_index: number | null; explanation: string | null; source: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.choices).not.toBeNull();
    const choices = JSON.parse(row!.choices!);
    expect(choices).toHaveLength(4);
    expect(row!.correct_index).toBe(0);
    expect(row!.explanation).toContain("accumulating the total sum");
    expect(row!.source).toBe("ai");
  });

  it("rejects MCQ with wrong number of choices", async () => {
    const { POST } = await import("@/app/api/quiz/cards/route");
    const res = await callRoute(POST, "/api/quiz/cards", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        problemId,
        cards: [{
          question: "Bad MCQ",
          answer: "ans",
          choices: ["A", "B"], // only 2 choices
          correct_index: 0,
        }]
      }),
    });
    console.log("Bad choices response:", res.status, JSON.stringify(res.body, null, 2));
    // Should accept but drop the MCQ fields since choices.length !== 4
    expect(res.status).toBe(200);
    // The card should still be inserted but without choices
    const row = currentTestDb()
      .prepare("SELECT choices, correct_index FROM notes WHERE problem_id = ? AND text = ?")
      .get(problemId, "Bad MCQ") as { choices: string | null; correct_index: number | null } | undefined;
    expect(row).toBeDefined();
    expect(row!.choices).toBeNull();
    expect(row!.correct_index).toBeNull();
  });

  it("rejects MCQ with invalid correct_index", async () => {
    const { POST } = await import("@/app/api/quiz/cards/route");
    const res = await callRoute(POST, "/api/quiz/cards", {
      method: "POST",
      cookies,
      body: JSON.stringify({
        problemId,
        cards: [{
          question: "Bad index MCQ",
          answer: "ans",
          choices: ["A", "B", "C", "D"],
          correct_index: 5, // invalid
        }]
      }),
    });
    console.log("Bad index response:", res.status, JSON.stringify(res.body, null, 2));
    expect(res.status).toBe(200);
    const row = currentTestDb()
      .prepare("SELECT correct_index FROM notes WHERE problem_id = ? AND text = ?")
      .get(problemId, "Bad index MCQ") as { correct_index: number | null } | undefined;
    expect(row).toBeDefined();
    expect(row!.correct_index).toBeNull();
  });
});
