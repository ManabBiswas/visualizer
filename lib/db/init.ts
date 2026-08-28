import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "codelens.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      link TEXT,
      topic_tags TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT CHECK(difficulty IN ('Easy','Medium','Hard')),
      source_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

  // Lightweight migrations for databases created before these columns existed.
  const analysisColumns = db.prepare("PRAGMA table_info(analyses)").all() as { name: string }[];
  if (!analysisColumns.some((c) => c.name === "method_name")) {
    db.exec("ALTER TABLE analyses ADD COLUMN method_name TEXT");
  }
  const noteColumns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
  if (!noteColumns.some((c) => c.name === "answer")) {
    db.exec("ALTER TABLE notes ADD COLUMN answer TEXT");
  }

  return db;
}
