import { randomUUID } from "crypto";
import Database from "libsql";
import { withDb } from "./init";

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
// Wrapped in withDb(): a long-lived server's Turso stream can go stale
// ("Hrana: stream not found") and must reconnect once before failing.
//
// The upsert is a single INSERT ... ON CONFLICT statement (not
// SELECT-then-INSERT), so two concurrent first-logins can't race: the UNIQUE
// index arbitrates and the RETURNING row comes from whichever insert won.
export function getOrCreateUser(
  user: {
    githubId: string;
    login: string;
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  },
  conn?: Database.Database,
): DbUser {
  const run = (db: Database.Database): DbUser => {
    const id = randomUUID();
    return db
      .prepare(
        `INSERT INTO users (id, github_id, login, name, email, avatar_url)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(github_id) DO UPDATE SET
           login = excluded.login,
           name = COALESCE(excluded.name, users.name),
           email = COALESCE(excluded.email, users.email),
           avatar_url = excluded.avatar_url
         RETURNING id, github_id, login, name, email, avatar_url`,
      )
      .get(
        id,
        user.githubId,
        user.login,
        user.name ?? null,
        user.email ?? null,
        user.avatarUrl ?? null,
      ) as DbUser;
  };

  return conn ? run(conn) : withDb(run);
}
