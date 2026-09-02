import Database from "libsql";
import path from "path";

// Remote (Turso) when configured, local file otherwise. Both use the same
// better-sqlite3-compatible synchronous API, so no route code changes.
const TURSO_URL = process.env.TURSO_DATABASE_URL;
const DB_PATH = path.join(process.cwd(), "codelens.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  if (TURSO_URL) {
    // libsql's bundled types lag its runtime: the constructor accepts
    // `authToken` for remote Turso connections (index.js reads opts.authToken),
    // but Database.Options was copied from better-sqlite3 and omits it.
    db = new Database(TURSO_URL, {
      authToken: process.env.TURSO_AUTH_TOKEN,
    } as Database.Options);
  } else {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
  }
  db.pragma("foreign_keys = ON");

  migrate(db);
  return db;
}

// Schema v2 (multi-user): problems are owned by a GitHub-authenticated user.
// Exported so tests can run it against throwaway databases.
export function migrate(db: Database.Database): void {
  // v1 -> v2: `problems` lacked user_id and carried a global UNIQUE(name)
  // that SQLite cannot ALTER away, so the table is rebuilt instead. Rows from
  // the single-user era cannot be attributed to an account and are dropped
  // (pre-production dev data). The DROP performs an implicit DELETE, which
  // cascades to analyses/notes/card_states via their ON DELETE CASCADE keys.
  const problemsColumns = db.prepare("PRAGMA table_info(problems)").all() as { name: string }[];
  if (problemsColumns.length > 0 && !problemsColumns.some((c) => c.name === "user_id")) {
    db.exec("DROP TABLE problems");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      github_id TEXT NOT NULL UNIQUE,
      login TEXT NOT NULL,
      name TEXT,
      email TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      link TEXT,
      topic_tags TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT CHECK(difficulty IN ('Easy','Medium','Hard')),
      source_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name)
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      method_name TEXT,
      time_complexity TEXT,
      space_complexity TEXT,
      time_confidence TEXT,
      space_confidence TEXT,
      ir_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
      tag_type TEXT NOT NULL,
      text TEXT NOT NULL,
      line_number INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS card_states (
      note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
      repetitions INTEGER NOT NULL DEFAULT 0,
      ease_factor REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      last_reviewed TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_analyses_problem ON analyses(problem_id);
    CREATE INDEX IF NOT EXISTS idx_notes_problem ON notes(problem_id);
    CREATE INDEX IF NOT EXISTS idx_card_states_due ON card_states(due_date);
  `);

  // Lightweight migrations for tables created before these columns existed.
  const analysisColumns = db.prepare("PRAGMA table_info(analyses)").all() as { name: string }[];
  if (!analysisColumns.some((c) => c.name === "method_name")) {
    db.exec("ALTER TABLE analyses ADD COLUMN method_name TEXT");
  }
  const noteColumns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
  if (!noteColumns.some((c) => c.name === "answer")) {
    db.exec("ALTER TABLE notes ADD COLUMN answer TEXT");
  }
  // card_states.lapse_count: how many times the card was graded "again" —
  // cards at >= MISTAKE_THRESHOLD form the mistake journal.
  const cardColumns = db.prepare("PRAGMA table_info(card_states)").all() as { name: string }[];
  if (!cardColumns.some((c) => c.name === "lapse_count")) {
    db.exec("ALTER TABLE card_states ADD COLUMN lapse_count INTEGER NOT NULL DEFAULT 0");
  }
}
