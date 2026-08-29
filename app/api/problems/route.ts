import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { cleanQueryParam } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";

export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your problem log." }, { status: 401 });
  }

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
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC`,
      )
      .all(userId) as any[];
  } catch (err) {
    return NextResponse.json(
      { problems: [], warning: `Could not read the problem log: ${redactSecrets((err as Error).message)}` },
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
