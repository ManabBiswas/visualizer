// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { callRoute, createTestDb, useTestDb, sessionCookies, currentTestDb } from "./harness";

// Python pipeline through the real /api/analyze route: language dispatch,
// # comment tags, saved language column, and the 422 error path. Mirrors
// the ownership-suite style (real write path, in-memory DB).

const TIMEOUT = 30000;

const PY_SOURCE = `def two_sum(nums, target):
    seen = {}  # note: value -> index map
    for i, v in enumerate(nums):
        # q: why check the dict before inserting?
        need = target - v
        if need in seen:
            return [seen[need], i]
        seen[v] = i
    return []
`;

let cookies: { "next-auth.session-token": string };
let problemId: string;

beforeAll(async () => {
  await useTestDb(await createTestDb());
  cookies = await sessionCookies({ githubId: "py-user-1", login: "py-user" });

  const { POST } = await import("@/app/api/analyze/route");
  const res = await callRoute(POST, "/api/analyze", {
    method: "POST",
    cookies,
    body: JSON.stringify({
      source: PY_SOURCE,
      language: "python",
      problem: { name: "Two Sum Py", topicTags: ["Hash Table"], difficulty: "Easy" },
    }),
  });
  expect(res.status).toBe(200);
  const body = res.body as { savedProblemId: string | null; saveWarning: string | null };
  expect(body.saveWarning).toBeNull();
  expect(body.savedProblemId).toBeTruthy();
  problemId = body.savedProblemId!;
}, 120000);

describe("POST /api/analyze (python)", () => {
  it("analyzes Python source end-to-end with # tags", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      body: JSON.stringify({ source: PY_SOURCE, language: "python" }),
    });
    expect(res.status).toBe(200);
    type AnalyzeBody = {
      results: Array<{
        method: { name: string; comments: { tag: string }[] };
        complexity: { time: { bigO: string }; space: { bigO: string } };
      }>;
    };
    const body = res.body as AnalyzeBody;
    expect(body.results).toHaveLength(1);
    expect(body.results[0].method.name).toBe("two_sum");
    // # note: and # q: both attached
    const tags = body.results[0].method.comments.map((c) => c.tag).sort();
    expect(tags).toEqual(["note", "q"]);
    expect(body.results[0].complexity.time.bigO).toBe("O(n)");
    expect(body.results[0].complexity.space.bigO).toBe("O(n)");
  });

  it("defaults to Java when language is absent (back-compat)", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      body: JSON.stringify({ source: "class A { void f() {} }" }),
    });
    expect(res.status).toBe(200);
  });

  it("400 on an unsupported language", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      body: JSON.stringify({ source: "def f():\n    pass\n", language: "cobol" }),
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("`language`");
  });

  it("422 with a Python-labeled parse error on bad Python", { timeout: TIMEOUT }, async () => {
    const { POST } = await import("@/app/api/analyze/route");
    const res = await callRoute(POST, "/api/analyze", {
      method: "POST",
      body: JSON.stringify({ source: "def broken(:\n    pass\n", language: "python" }),
    });
    expect(res.status).toBe(422);
    expect((res.body as { error: string }).error).toContain("Failed to parse Python source");
  });

  it("persists language='python' on the saved problem", { timeout: TIMEOUT }, () => {
    const row = currentTestDb()
      .prepare("SELECT language FROM problems WHERE id = ?")
      .get(problemId) as { language: string };
    expect(row.language).toBe("python");
  });

  it("GET /api/problems/[id] returns the language for deep links", { timeout: TIMEOUT }, async () => {
    const { GET } = await import("@/app/api/problems/[id]/route");
    const res = await callRoute(GET, "/api/problems/x", {
      cookies,
      params: { id: problemId },
    });
    expect(res.status).toBe(200);
    expect((res.body as { problem: { language: string } }).problem.language).toBe("python");
  });

  it("parser-extracted # notes are saved as quiz-source rows", { timeout: TIMEOUT }, () => {
    const rows = currentTestDb()
      .prepare("SELECT tag_type, source FROM notes WHERE problem_id = ? ORDER BY tag_type")
      .all(problemId) as { tag_type: string; source: string | null }[];
    expect(rows.map((r) => r.tag_type).sort()).toEqual(["note", "q"]);
    expect(rows.every((r) => r.source === null)).toBe(true);
  });
});
