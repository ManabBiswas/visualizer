import { beforeEach, describe, expect, it } from "vitest";
import Database from "libsql";
import { migrate } from "./init";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
});

describe("schema v2 migration", () => {
  it("creates the users table with a unique github_id", () => {
    migrate(db);
    const cols = (db.prepare("PRAGMA table_info(users)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("github_id");
    expect(cols).toContain("login");
    expect(cols).toContain("avatar_url");

    db.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u1", "101", "octocat");
    expect(() =>
      db.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u2", "101", "impostor"),
    ).toThrow();
  });

  it("scopes problem names per user via UNIQUE(user_id, name)", () => {
    migrate(db);
    db.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u1", "101", "octocat");
    db.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u2", "202", "dev");
    const insert = db.prepare(
      "INSERT INTO problems (id, user_id, name, source_code) VALUES (?, ?, ?, ?)",
    );
    insert.run("p1", "u1", "Two Sum", "class A {}");
    expect(() => insert.run("p2", "u1", "Two Sum", "class B {}")).toThrow();
    // Same name is fine for a different user.
    insert.run("p3", "u2", "Two Sum", "class C {}");
    expect((db.prepare("SELECT COUNT(*) c FROM problems").get() as { c: number }).c).toBe(2);
  });

  it("rebuilds a v1 problems table (no user_id) and drops unattributable rows", () => {
    db.exec(`
      CREATE TABLE problems (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        source_code TEXT NOT NULL
      );
      INSERT INTO problems VALUES ('p1', 'Old Problem', 'class Old {}');
    `);
    migrate(db);
    const cols = (db.prepare("PRAGMA table_info(problems)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("user_id");
    expect((db.prepare("SELECT COUNT(*) c FROM problems").get() as { c: number }).c).toBe(0);
  });

  it("rejects a problem without a user", () => {
    migrate(db);
    expect(() =>
      db.prepare("INSERT INTO problems (id, name, source_code) VALUES (?, ?, ?)").run(
        "p1",
        "Orphan",
        "class X {}",
      ),
    ).toThrow();
  });

  it("is idempotent", () => {
    migrate(db);
    migrate(db);
    expect((db.prepare("SELECT COUNT(*) c FROM users").get() as { c: number }).c).toBe(0);
  });

  it("keeps v2 problems across a re-migrate", () => {
    migrate(db);
    db.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u1", "101", "octocat");
    db.prepare("INSERT INTO problems (id, user_id, name, source_code) VALUES (?, ?, ?, ?)").run(
      "p1",
      "u1",
      "Two Sum",
      "class A {}",
    );
    migrate(db);
    expect((db.prepare("SELECT COUNT(*) c FROM problems").get() as { c: number }).c).toBe(1);
  });
});

describe("card_states.lapse_count migration", () => {
  it("adds lapse_count with default 0 and keeps existing rows", () => {
    migrate(db);
    db.prepare("INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)").run("u1", "101", "octocat");
    db.prepare("INSERT INTO problems (id, user_id, name, source_code) VALUES (?, ?, ?, ?)").run(
      "p1", "u1", "Two Sum", "class A {}",
    );
    db.prepare("INSERT INTO notes (id, problem_id, tag_type, text) VALUES (?, ?, ?, ?)").run(
      "n1", "p1", "q", "why?",
    );
    db.prepare(
      "INSERT INTO card_states (note_id, repetitions, ease_factor, interval_days, due_date) VALUES (?, 0, 2.5, 0, ?)",
    ).run("n1", new Date().toISOString());
    // Re-migrate: the lightweight migration adds lapse_count to the
    // pre-existing table without touching the row.
    migrate(db);
    const cols = (db.prepare("PRAGMA table_info(card_states)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("lapse_count");
    const row = db
      .prepare("SELECT lapse_count FROM card_states WHERE note_id = ?")
      .get("n1") as { lapse_count: number };
    expect(row.lapse_count).toBe(0);
  });

  it("is idempotent when lapse_count already exists", () => {
    migrate(db);
    migrate(db);
    const cols = (db.prepare("PRAGMA table_info(card_states)").all() as { name: string }[]).map((c) => c.name);
    expect(cols.filter((c) => c === "lapse_count")).toHaveLength(1);
  });
});
