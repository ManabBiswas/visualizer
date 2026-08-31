import { randomUUID } from "crypto";
import Database from "libsql";
import { getDb } from "./init";

export type DbUser = {
  id: string;
  github_id: string;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
};

// Upsert keyed on the immutable GitHub id: renames, email changes, and avatar
// swaps refresh the row; the primary id stays stable, so problems.user_id
// never dangles. Returns the internal id routes stamp onto problems.
export function getOrCreateUser(
  user: {
    githubId: string;
    login: string;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  },
  conn: Database.Database = getDb(),
): DbUser {
  const db = conn;
  const existing = db
    .prepare("SELECT id, github_id, login, name, email, avatar_url FROM users WHERE github_id = ?")
    .get(user.githubId) as DbUser | undefined;

  if (existing) {
    db.prepare(
      "UPDATE users SET login = ?, name = ?, email = ?, avatar_url = ? WHERE id = ?",
    ).run(user.login, user.name ?? null, user.email ?? null, user.avatarUrl ?? null, existing.id);
    return { ...existing, login: user.login, name: user.name ?? null, email: user.email ?? null, avatar_url: user.avatarUrl ?? null };
  }

  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, github_id, login, name, email, avatar_url) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, user.githubId, user.login, user.name ?? null, user.email ?? null, user.avatarUrl ?? null);
  return { id, github_id: user.githubId, login: user.login, name: user.name ?? null, email: user.email ?? null, avatar_url: user.avatarUrl ?? null };
}
