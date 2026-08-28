import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { cleanQueryParam } from "@/lib/security/validate";

export async function GET(req: NextRequest) {
  const topic = cleanQueryParam(req.nextUrl.searchParams.get("topic"));
  const difficulty = cleanQueryParam(req.nextUrl.searchParams.get("difficulty"));

  let rows: any[];
  try {
    const db = getDb();
    // One row per problem: pick the most recent analysis so re-analyzing
    // (which upserts the problem and adds a new analysis row) never duplicates rows.
    rows = db
      .prepare(
        `SELECT p.id, p.name, p.link, p.topic_tags, p.difficulty, p.created_at,
                la.time_complexity, la.space_complexity,
                (SELECT COUNT(*) FROM notes n WHERE n.problem_id = p.id) as note_count
         FROM problems p
         LEFT JOIN (
           SELECT problem_id, time_complexity, space_complexity,
                  ROW_NUMBER() OVER (PARTITION BY problem_id ORDER BY created_at DESC, rowid DESC) as rn
           FROM analyses
         ) la ON la.problem_id = p.id AND la.rn = 1
         ORDER BY p.created_at DESC`,
      )
      .all() as any[];
  } catch (err) {
    // Same read-only-filesystem concern as /api/analyze — see DEPLOYMENT.md.
    // Return an empty log with a warning rather than a 500, so the /log page
    // can still render (with its existing empty state) instead of crashing.
    return NextResponse.json(
      { problems: [], warning: `Could not read the problem log: ${(err as Error).message}` },
      { status: 200 },
    );
  }

  if (topic) {
    rows = rows.filter((r) => {
      try {
        return (JSON.parse(r.topic_tags || "[]") as string[]).includes(topic);
      } catch {
        return false;
      }
    });
  }
  if (difficulty) rows = rows.filter((r) => r.difficulty === difficulty);

  return NextResponse.json({ problems: rows });
}
