import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { isValidId } from "@/lib/security/validate";
import { GRADES, Grade, newCardState, schedule, CardState } from "@/lib/spaced/repetition";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { noteId, grade } = (body ?? {}) as { noteId?: unknown; grade?: unknown };

  if (typeof noteId !== "string" || !isValidId(noteId)) {
    return NextResponse.json({ error: "Invalid `noteId`." }, { status: 400 });
  }
  if (typeof grade !== "string" || !(GRADES as readonly string[]).includes(grade)) {
    return NextResponse.json({ error: "`grade` must be again, good, or easy." }, { status: 400 });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }

  const note = db
    .prepare("SELECT id FROM notes WHERE id = ? AND tag_type = 'q'")
    .get(noteId) as { id: string } | undefined;
  if (!note) {
    return NextResponse.json({ error: "Quiz card not found." }, { status: 404 });
  }

  const existing = db
    .prepare("SELECT repetitions, ease_factor, interval_days, due_date, last_reviewed FROM card_states WHERE note_id = ?")
    .get(noteId) as
    | { repetitions: number; ease_factor: number; interval_days: number; due_date: string; last_reviewed: string | null }
    | undefined;

  const current: CardState = existing
    ? {
        repetitions: existing.repetitions,
        easeFactor: existing.ease_factor,
        intervalDays: existing.interval_days,
        dueDate: existing.due_date,
        lastReviewed: existing.last_reviewed,
      }
    : newCardState();

  const next = schedule(current, grade as Grade);

  db.prepare(
    `INSERT INTO card_states (note_id, repetitions, ease_factor, interval_days, due_date, last_reviewed)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(note_id) DO UPDATE SET
       repetitions = excluded.repetitions,
       ease_factor = excluded.ease_factor,
       interval_days = excluded.interval_days,
       due_date = excluded.due_date,
       last_reviewed = excluded.last_reviewed`,
  ).run(noteId, next.repetitions, next.easeFactor, next.intervalDays, next.dueDate, next.lastReviewed);

  return NextResponse.json({ state: next });
}
