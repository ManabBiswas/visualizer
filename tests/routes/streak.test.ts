// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { callRoute, createTestDb, sessionCookies, useTestDb } from "./harness";
import { GET } from "@/app/api/progress/streak/route";
import { getOrCreateUser } from "@/lib/db/users";

const DAY = 24 * 60 * 60 * 1000;

let cookies: { "next-auth.session-token": string };
let db: Awaited<ReturnType<typeof createTestDb>>;

function localDayKey(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * DAY);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

beforeAll(async () => {
  db = await createTestDb();
  await useTestDb(db);
  cookies = await sessionCookies({ githubId: "77", login: "streaker" });
  const user = getOrCreateUser({
    githubId: "77",
    login: "streaker",
    name: "Streaker",
    email: null,
    avatarUrl: null,
  });

  // Two consecutive active days: problems saved today and yesterday.
  for (const offset of [0, 1]) {
    db.prepare(
      `INSERT INTO problems (id, user_id, name, source_code, created_at)
       VALUES (?, ?, ?, '', ?)`,
    ).run(
      `p-${offset}`,
      user.id,
      `streak-problem-${offset}`,
      `${localDayKey(offset)}T10:00:00.000Z`,
    );
  }
});

describe("GET /api/progress/streak", () => {
  it("returns the consecutive-day streak for the signed-in user", async () => {
    const res = await callRoute(GET, "/api/progress/streak", { cookies });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ streak: 2 });
  });

  it("401s when signed out", async () => {
    const res = await callRoute(GET, "/api/progress/streak");
    expect(res.status).toBe(401);
  });
});
