import { beforeEach, describe, expect, it } from "vitest";
import Database from "libsql";
import { migrate } from "./init";
import { getOrCreateUser } from "./users";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

describe("getOrCreateUser", () => {
  it("creates a user on first sight and returns a stable internal id", () => {
    const u = getOrCreateUser(
      { githubId: "101", login: "octocat", name: "Octo Cat", email: "o@cat.dev", avatarUrl: "https://x/a.png" },
      db,
    );
    expect(u.id).toBeTruthy();
    expect(u.github_id).toBe("101");
    expect(u.login).toBe("octocat");
    expect(u.email).toBe("o@cat.dev");
  });

  it("returns the same internal id when the GitHub profile changes", () => {
    const first = getOrCreateUser({ githubId: "101", login: "octocat" }, db);
    const renamed = getOrCreateUser(
      { githubId: "101", login: "newname", name: "Renamed", email: "n@cat.dev" },
      db,
    );
    expect(renamed.id).toBe(first.id);
    expect(renamed.login).toBe("newname");
    expect((db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c).toBe(1);
  });

  it("keeps separate users separate", () => {
    const a = getOrCreateUser({ githubId: "101", login: "octocat" }, db);
    const b = getOrCreateUser({ githubId: "202", login: "dev" }, db);
    expect(a.id).not.toBe(b.id);
    expect((db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c).toBe(2);
  });

  it("problems can reference the returned id", () => {
    const u = getOrCreateUser({ githubId: "101", login: "octocat" }, db);
    db.prepare("INSERT INTO problems (id, user_id, name, source_code) VALUES (?, ?, ?, ?)").run(
      "p1",
      u.id,
      "Two Sum",
      "class A {}",
    );
    expect((db.prepare("SELECT COUNT(*) c FROM problems").get() as { c: number }).c).toBe(1);
  });
});
