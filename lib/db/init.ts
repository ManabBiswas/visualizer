import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "codelens.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS problems (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      link TEXT,
      topic_tags TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT CHECK(difficulty IN ('Easy','Medium','Hard')),
      source_code TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS analyses (
      id TEXT PRIMARY KEY,
      problem_id TEXT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
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
  `);

  return db;
}
