// @vitest-environment node
import { describe, expect, it, beforeAll } from "vitest";
import { callRoute, createTestDb, useTestDb, sessionCookies } from "./harness";

// Smoke test: proves the harness plumbing end-to-end — real auth() reads our
// minted cookie from the request store, and getAuthedUserId() upserts the
// users row into the in-memory DB.
describe("harness plumbing", () => {
  beforeAll(async () => {
    await useTestDb(await createTestDb());
  });

  it(
    "auth() resolves a minted session inside the ALS context",
    async () => {
      const { GET } = await import("@/app/api/problems/route");
      const cookies = await sessionCookies({ githubId: "777", login: "smoke-user" });

      const res = await callRoute(GET, "/api/problems", { cookies });
      if (res.status !== 200) console.log("BODY:", JSON.stringify(res.body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ problems: [] });

      // The user row was upserted by getAuthedUserId on first sight.
      const { currentTestDb } = await import("./harness");
      const row = currentTestDb()
        .prepare("SELECT github_id, login FROM users WHERE github_id = ?")
        .get("777") as { github_id: string; login: string };
      expect(row.login).toBe("smoke-user");
    },
    30000,
  );

  it(
    "anonymous requests 401 before touching the DB",
    async () => {
      const { GET } = await import("@/app/api/problems/route");
      const res = await callRoute(GET, "/api/problems");
      expect(res.status).toBe(401);
      expect((res.body as { error: string }).error).toContain("Sign in");
    },
    30000,
  );
});
