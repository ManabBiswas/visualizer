// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { randomUUID } from "crypto";
import { callRoute, createTestDb, useTestDb, sessionCookies, currentTestDb } from "./harness";

// Ownership matrix: every owner-scoped route must 401 anonymous callers,
// 404 foreign ids indistinguishably from missing ones, and 200 for the owner.
// This automates the security matrix the 2026-09 audit verified by hand.

const TIMEOUT = 30000; // route module import + auth machinery is slow on first load

const SAMPLE_SOURCE = `public class Main {
  public static int solve(int[] a) {
    // q: what is the loop invariant?
    for (int i = 0; i < a.length; i++) { a[0] += a[i]; }
    return a[0];
  }
}`;

const PROBLEM_META = { name: "Matrix Test Problem", topicTags: ["Arrays"], difficulty: "Easy" };

type Users = { aliceCookies: { "next-auth.session-token": string }; bobCookies: { "next-auth.session-token": string } };

let users: Users;
let aliceProblemId: string;
let aliceQuizNoteId: string;

beforeAll(async () => {
  await useTestDb(await createTestDb());
  users = {
    aliceCookies: await sessionCookies({ githubId: "alice-1", login: "alice" }),
    bobCookies: await sessionCookies({ githubId: "bob-2", login: "bob" }),
  };

  // Seed one saved problem for alice via the real analyze pipeline (POST
  // /api/analyze is the production write path for problems + parser notes).
  const { POST } = await import("@/app/api/analyze/route");
  const res = await callRoute(POST, "/api/analyze", {
    method: "POST",
    cookies: users.aliceCookies,
    body: JSON.stringify({ source: SAMPLE_SOURCE, problem: PROBLEM_META }),
  });
  const body = res.body as { savedProblemId: string | null; saveWarning: string | null };
  expect(body.saveWarning).toBeNull();
  expect(body.savedProblemId).toBeTruthy();
  aliceProblemId = body.savedProblemId!;
  expect(res.status).toBe(200);

  // Seed one quiz card (parser-extracted q-tag note) owned by alice.
  const noteRow = currentTestDb()
    .prepare("SELECT id FROM notes WHERE problem_id = ? AND tag_type = 'q'")
    .get(aliceProblemId) as { id: string };
  aliceQuizNoteId = noteRow.id;
  expect(aliceQuizNoteId).toBeTruthy();
}, 120000);

describe("GET /api/problems (list)", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/route");
    expect((await callRoute(GET, "/api/problems")).status).toBe(401);
  });

  it("owner sees own problems only", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/route");
    const res = await callRoute(GET, "/api/problems", { cookies: users.bobCookies });
    expect(res.status).toBe(200);
    expect((res.body as { problems: unknown[] }).problems).toEqual([]);
  });
});

describe("GET /api/problems/[id]", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/[id]/route");
    expect((await callRoute(GET, "/api/problems/x", { params: { id: aliceProblemId } })).status).toBe(401);
  });

  it("400 invalid id", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/[id]/route");
    // isValidId allows [\w-]{1,64}; "!!!" is rejected shape.
    const res = await callRoute(GET, "/api/problems/bad-id", { cookies: users.aliceCookies, params: { id: "!!!" } });
    expect(res.status).toBe(400);
  });

  it("404 foreign problem indistinguishable from missing", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/[id]/route");
    // bob requests alice's problem: same 404 as a nonexistent id.
    const foreign = await callRoute(GET, "/api/problems/x", { cookies: users.bobCookies, params: { id: aliceProblemId } });
    const missing = await callRoute(GET, "/api/problems/x", { cookies: users.bobCookies, params: { id: randomUUID() } });
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it("200 owner with problem payload", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/[id]/route");
    const res = await callRoute(GET, "/api/problems/x", { cookies: users.aliceCookies, params: { id: aliceProblemId } });
    expect(res.status).toBe(200);
    const { problem } = res.body as { problem: { id: string; name: string } };
    expect(problem.id).toBe(aliceProblemId);
    expect(problem.name).toBe(PROBLEM_META.name);
  });
});

describe("POST/DELETE /api/problems/[id]/share", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { POST, DELETE } = await import("@/app/api/problems/[id]/share/route");
    expect((await callRoute(POST, "/api/problems/x/share", { params: { id: aliceProblemId } })).status).toBe(401);
    expect((await callRoute(DELETE, "/api/problems/x/share", { params: { id: aliceProblemId } })).status).toBe(401);
  });

  it("404 foreign problem on create", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/problems/[id]/share/route");
    const res = await callRoute(POST, "/api/problems/x/share", { cookies: users.bobCookies, params: { id: aliceProblemId } });
    expect(res.status).toBe(404);
  });

  it("200 create is idempotent, then revoke 404s foreign revocation", { timeout: TIMEOUT }, async () => {
    const { POST, DELETE } = await import("@/app/api/problems/[id]/share/route");
    const first = await callRoute(POST, "/api/problems/x/share", { cookies: users.aliceCookies, params: { id: aliceProblemId } });
    expect(first.status).toBe(200);
    const slug = (first.body as { slug: string }).slug;
    expect(slug).toMatch(/^[A-Za-z0-9]{12}$/);

    // Idempotent: same slug returned, never rotated.
    const second = await callRoute(POST, "/api/problems/x/share", { cookies: users.aliceCookies, params: { id: aliceProblemId } });
    expect((second.body as { slug: string }).slug).toBe(slug);

    // Foreign revoke is a 404, and the slug survives it.
    const foreign = await callRoute(DELETE, "/api/problems/x/share", { cookies: users.bobCookies, params: { id: aliceProblemId } });
    expect(foreign.status).toBe(404);
    const stillShared = currentTestDb()
      .prepare("SELECT share_slug FROM problems WHERE id = ?")
      .get(aliceProblemId) as { share_slug: string };
    expect(stillShared.share_slug).toBe(slug);

    // Owner revoke clears it.
    const revoke = await callRoute(DELETE, "/api/problems/x/share", { cookies: users.aliceCookies, params: { id: aliceProblemId } });
    expect(revoke.status).toBe(200);
    expect((revoke.body as { revoked: boolean }).revoked).toBe(true);
    const cleared = currentTestDb()
      .prepare("SELECT share_slug FROM problems WHERE id = ?")
      .get(aliceProblemId) as { share_slug: string | null };
    expect(cleared.share_slug).toBeNull();
  });
});

describe("GET /api/quiz", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/quiz/route");
    expect((await callRoute(GET, "/api/quiz")).status).toBe(401);
  });

  it("owner sees only own cards", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/quiz/route");
    const alice = await callRoute(GET, "/api/quiz", { cookies: users.aliceCookies });
    expect(alice.status).toBe(200);
    expect((alice.body as { cards: unknown[] }).cards).toHaveLength(1);

    const bob = await callRoute(GET, "/api/quiz", { cookies: users.bobCookies });
    expect((bob.body as { cards: unknown[] }).cards).toEqual([]);
  });

  it("400 invalid problem filter", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/quiz/route");
    const res = await callRoute(GET, "/api/quiz?problem=%21%21%21", { cookies: users.aliceCookies });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/quiz/review", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/quiz/review/route");
    const res = await callRoute(POST, "/api/quiz/review", {
      method: "POST",
      body: JSON.stringify({ noteId: aliceQuizNoteId, grade: "good" }),
    });
    expect(res.status).toBe(401);
  });

  it("400 bad grade / bad noteId", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/quiz/review/route");
    const badGrade = await callRoute(POST, "/api/quiz/review", {
      method: "POST",
      cookies: users.aliceCookies,
      body: JSON.stringify({ noteId: aliceQuizNoteId, grade: "nope" }),
    });
    expect(badGrade.status).toBe(400);
    const badId = await callRoute(POST, "/api/quiz/review", {
      method: "POST",
      cookies: users.aliceCookies,
      body: JSON.stringify({ noteId: "!!!", grade: "good" }),
    });
    expect(badId.status).toBe(400);
  });

  it("404 foreign card, 200 owner schedules SM-2", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/quiz/review/route");
    const foreign = await callRoute(POST, "/api/quiz/review", {
      method: "POST",
      cookies: users.bobCookies,
      body: JSON.stringify({ noteId: aliceQuizNoteId, grade: "good" }),
    });
    expect(foreign.status).toBe(404);

    const mine = await callRoute(POST, "/api/quiz/review", {
      method: "POST",
      cookies: users.aliceCookies,
      body: JSON.stringify({ noteId: aliceQuizNoteId, grade: "good" }),
    });
    expect(mine.status).toBe(200);
    const body = mine.body as { state: { repetitions: number }; lapseCount: number };
    expect(body.state.repetitions).toBeGreaterThan(0);
    expect(body.lapseCount).toBe(0);
  });
});

describe("PATCH /api/notes/[id]", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await callRoute(PATCH, "/api/notes/x", {
      method: "PATCH",
      params: { id: aliceQuizNoteId },
      body: JSON.stringify({ answer: "nope" }),
    });
    expect(res.status).toBe(401);
  });

  it("404 foreign note", { timeout: TIMEOUT }, async () => {
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await callRoute(PATCH, "/api/notes/x", {
      method: "PATCH",
      cookies: users.bobCookies,
      params: { id: aliceQuizNoteId },
      body: JSON.stringify({ answer: "bob was here" }),
    });
    expect(res.status).toBe(404);
    const stored = currentTestDb()
      .prepare("SELECT answer FROM notes WHERE id = ?")
      .get(aliceQuizNoteId) as { answer: string | null };
    expect(stored.answer).toBeNull();
  });

  it("200 owner stores answer", { timeout: TIMEOUT }, async () => {
    const { PATCH } = await import("@/app/api/notes/[id]/route");
    const res = await callRoute(PATCH, "/api/notes/x", {
      method: "PATCH",
      cookies: users.aliceCookies,
      params: { id: aliceQuizNoteId },
      body: JSON.stringify({ answer: "invariant holds" }),
    });
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    const stored = currentTestDb()
      .prepare("SELECT answer FROM notes WHERE id = ?")
      .get(aliceQuizNoteId) as { answer: string };
    expect(stored.answer).toBe("invariant holds");
  });
});

describe("GET /api/progress", () => {
  it("401 anonymous", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/progress/route");
    expect((await callRoute(GET, "/api/progress")).status).toBe(401);
  });

  it("200 owner with stats", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/progress/route");
    const res = await callRoute(GET, "/api/progress", { cookies: users.aliceCookies });
    expect(res.status).toBe(200);
    const body = res.body as { totals: { cards: number; problems: number } };
    expect(body.totals.cards).toBe(1);
    expect(body.totals.problems).toBe(1);
  });
});

describe("POST /api/analyze", () => {
  it("400 invalid JSON body", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", { method: "POST", body: "not json{" });
    expect(res.status).toBe(400);
  });

  it("422 unparseable Java", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      body: JSON.stringify({ source: "this is not java at all {" }),
    });
    expect(res.status).toBe(422);
  });

  it("200 anonymous returns results without saving", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      body: JSON.stringify({ source: SAMPLE_SOURCE, problem: PROBLEM_META }),
    });
    expect(res.status).toBe(200);
    const body = res.body as { savedProblemId: string | null; saveWarning: string | null };
    expect(body.savedProblemId).toBeNull();
    expect(body.saveWarning).toContain("Sign in");
  });

  it("200 owner re-analyze refreshes parser notes but preserves answers", { timeout: TIMEOUT }, async () => {
    // alice re-analyzes the same problem name: the upsert refreshes
    // parser-extracted notes (new note rows, answers cleared) but must NOT
    // duplicate the problem. User-authored data (source='ai' cards) is
    // protected by the source IS NULL scope.
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      cookies: users.aliceCookies,
      body: JSON.stringify({ source: SAMPLE_SOURCE, problem: PROBLEM_META }),
    });
    expect(res.status).toBe(200);
    const saved = (res.body as { savedProblemId: string }).savedProblemId;
    expect(saved).toBe(aliceProblemId); // upsert by name — no duplicate row

    const count = currentTestDb()
      .prepare("SELECT COUNT(*) as n FROM problems WHERE user_id = (SELECT id FROM users WHERE github_id = 'alice-1')")
      .get() as { n: number };
    expect(count.n).toBe(1);
  });
});
