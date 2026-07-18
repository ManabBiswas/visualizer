import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";

export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic");
  const difficulty = req.nextUrl.searchParams.get("difficulty");

  let rows: any[];
  try {
    const db = getDb();
    rows = db
      .prepare(
        `SELECT p.id, p.name, p.link, p.topic_tags, p.difficulty, p.created_at,
                a.time_complexity, a.space_complexity,
                (SELECT COUNT(*) FROM notes n WHERE n.problem_id = p.id) as note_count
         FROM problems p
         LEFT JOIN analyses a ON a.problem_id = p.id
         ORDER BY p.created_at DESC`,
      )
      .all() as any[];
  } catch (err) {
    // Same read-only-filesystem concern as /api/analyze — see DEPLOYMENT.md.
    // Return an empty log with a warning rather than a 500, so the /log page
    // can still render (with an explanatory empty state) instead of crashing.
    return NextResponse.json(
      { problems: [], warning: `Could not read the problem log: ${(err as Error).message}` },
      { status: 200 },
    );
  }

  if (topic) rows = rows.filter((r) => JSON.parse(r.topic_tags).includes(topic));
  if (difficulty) rows = rows.filter((r) => r.difficulty === difficulty);

  return NextResponse.json({ problems: rows });
}
