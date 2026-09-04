import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { cleanQueryParam, isValidId } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { pickFocusSession } from "@/lib/spaced/focus";

type QuizRow = {
  id: string;
  problem_id: string;
  question: string;
  answer: string | null;
  line_number: number | null;
  problem_name: string;
  topic_tags: string;
  repetitions: number | null;
  ease_factor: number | null;
  interval_days: number | null;
  due_date: string | null;
  last_reviewed: string | null;
  lapse_count: number | null;
  source: string | null;
};

/** Cards graded "again" at least this many times form the mistake journal. */
const MISTAKE_THRESHOLD = 3;

export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your quiz cards." }, { status: 401 });
  }

  const topic = cleanQueryParam(req.nextUrl.searchParams.get("topic"));
  const problemId = cleanQueryParam(req.nextUrl.searchParams.get("problem"));
  const dueOnly = req.nextUrl.searchParams.get("due") === "1";
  const mistakesOnly = req.nextUrl.searchParams.get("mistakes") === "1";

  if (problemId && !isValidId(problemId)) {
    return NextResponse.json({ error: "Invalid problem id." }, { status: 400 });
  }

  let rows: QuizRow[];
  try {
    const db = getDb();
    rows = db
      .prepare(
        `SELECT n.id, n.problem_id, n.text AS question, n.answer, n.line_number,
                p.name AS problem_name, p.topic_tags,
                cs.repetitions, cs.ease_factor, cs.interval_days, cs.due_date, cs.last_reviewed,
                cs.lapse_count, n.source
         FROM notes n
         JOIN problems p ON p.id = n.problem_id
         LEFT JOIN card_states cs ON cs.note_id = n.id
         WHERE n.tag_type = 'q' AND p.user_id = ?
         ORDER BY CASE WHEN cs.due_date IS NULL THEN 0 ELSE 1 END, cs.due_date ASC, n.created_at ASC`,
      )
      .all(userId) as QuizRow[];
  } catch (err) {
    return NextResponse.json(
      { cards: [], warning: `Could not read quiz cards: ${redactSecrets((err as Error).message)}` },
      { status: 200 },
    );
  }

  const now = Date.now();
  let cards = rows.map((r) => {
    let topics: string[] = [];
    try {
      topics = JSON.parse(r.topic_tags || "[]");
    } catch {
      topics = [];
    }
    return {
      id: r.id,
      problemId: r.problem_id,
      question: r.question,
      answer: r.answer,
      lineNumber: r.line_number,
      problemName: r.problem_name,
      topics,
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
      due: r.due_date === null || new Date(r.due_date).getTime() <= now,
      lapseCount: r.lapse_count ?? 0,
      source: r.source === "ai" ? "ai" : "user",
    };
  });

  if (problemId) cards = cards.filter((c) => c.problemId === problemId);
  if (topic) cards = cards.filter((c) => c.topics.includes(topic));
  if (dueOnly) cards = cards.filter((c) => c.due);
  // Mistake journal: cards that keep tripping you up (>= 3 "again" grades).
  if (mistakesOnly) cards = cards.filter((c) => c.lapseCount >= MISTAKE_THRESHOLD);

  // Focus session: replace the filtered list with a weakest-topics drill.
  // Runs after the other filters so ?focus=weakest&problem=X scopes the drill
  // to that problem's cards if the user wants it.
  if (req.nextUrl.searchParams.get("focus") === "weakest") {
    const session = pickFocusSession(
      cards.map((c) => ({
        id: c.id,
        topics: c.topics,
        easeFactor: c.state ? c.state.easeFactor : null,
        due: c.due,
      })),
      10
    );
    const byId = new Map(cards.map((c) => [c.id, c]));
    const focused = session.cards
      .map((fc) => byId.get(fc.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    return NextResponse.json({ cards: focused, focus: session.topics });
  }

  return NextResponse.json({ cards });
}
