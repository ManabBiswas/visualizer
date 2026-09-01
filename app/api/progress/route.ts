import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { redactSecrets } from "@/lib/security/env";
import { computeProgressStats, type ProgressCardRow, type ProgressProblemRow } from "@/lib/progress/stats";

export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to see your progress." }, { status: 401 });
  }

  try {
    const db = getDb();

    // Every q-tagged note with its card state (LEFT JOIN — unreviewed cards
    // have no card_states row yet, they still count toward "cards" but are
    // always "due" as new material).
    const cardRows = db
      .prepare(
        `SELECT n.id AS note_id, n.problem_id, p.topic_tags,
                cs.ease_factor, cs.interval_days, cs.due_date, cs.repetitions, cs.last_reviewed
         FROM notes n
         JOIN problems p ON p.id = n.problem_id
         LEFT JOIN card_states cs ON cs.note_id = n.id
         WHERE n.tag_type = 'q' AND p.user_id = ?`
      )
      .all(userId) as Array<{
        note_id: string;
        problem_id: string;
        topic_tags: string;
        ease_factor: number | null;
        interval_days: number | null;
        due_date: string | null;
        repetitions: number | null;
        last_reviewed: string | null;
      }>;

    const problemRows = db
      .prepare(`SELECT id, topic_tags, created_at FROM problems WHERE user_id = ?`)
      .all(userId) as Array<{ id: string; topic_tags: string; created_at: string }>;

    const parseTags = (raw: string): string[] => {
      try {
        const v = JSON.parse(raw || "[]");
        return Array.isArray(v) ? v.filter((t): t is string => typeof t === "string") : [];
      } catch {
        return [];
      }
    };

    const cards: ProgressCardRow[] = cardRows.map((r) => ({
      noteId: r.note_id,
      problemId: r.problem_id,
      topics: parseTags(r.topic_tags),
      lastReviewed: r.last_reviewed,
      state:
        r.due_date === null
          ? null
          : {
              repetitions: r.repetitions ?? 0,
              easeFactor: r.ease_factor ?? 2.5,
              intervalDays: r.interval_days ?? 0,
              dueDate: r.due_date,
              lastReviewed: r.last_reviewed,
            },
    }));

    const problems: ProgressProblemRow[] = problemRows.map((r) => ({
      problemId: r.id,
      topics: parseTags(r.topic_tags),
      createdAt: r.created_at,
    }));

    return NextResponse.json(computeProgressStats(cards, problems));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not compute progress: ${redactSecrets((err as Error).message)}` },
      { status: 500 },
    );
  }
}
