import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { cleanQueryParam, parseJsonArray } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { isRateLimited } from "@/lib/security/rateLimit";

type ProblemListRow = {
  id: string;
  name: string;
  link: string | null;
  topic_tags: string;
  difficulty: string | null;
  created_at: string;
  share_slug: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  note_count: number;
};

export async function GET(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your problem log." }, { status: 401 });
  }
  // Per-user limit: the synchronous libsql client makes unbounded authed
  // flooding an event-loop DoS — cheap insurance on every owner-scoped route.
  if (await isRateLimited(`problems:${userId}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  const topic = cleanQueryParam(req.nextUrl.searchParams.get("topic"));
  const difficulty = cleanQueryParam(req.nextUrl.searchParams.get("difficulty"));

  let rows: ProblemListRow[];
  try {
    // withDb: self-heals a stale Turso Hrana stream (reconnect + retry once)
    // instead of returning an empty log on the first hiccup.
    rows = withDb((db) =>
      // One row per problem: pick the most recent analysis so re-analyzing
      // (which upserts the problem and adds a new analysis row) never duplicates rows.
      db
        .prepare(
          `SELECT p.id, p.name, p.link, p.topic_tags, p.difficulty, p.created_at,
                  p.share_slug,
                  la.time_complexity, la.space_complexity,
                  (SELECT COUNT(*) FROM notes n WHERE n.problem_id = p.id) as note_count
           FROM problems p
           LEFT JOIN (
             SELECT problem_id, time_complexity, space_complexity,
                    ROW_NUMBER() OVER (PARTITION BY problem_id ORDER BY created_at DESC, rowid DESC) as rn
             FROM analyses
           ) la ON la.problem_id = p.id AND la.rn = 1
           WHERE p.user_id = ?
           ORDER BY p.created_at DESC
           LIMIT 500`,
        )
        .all(userId),
    ) as ProblemListRow[];
  } catch (err) {
    return NextResponse.json(
      { problems: [], warning: `Could not read the problem log: ${redactSecrets((err as Error).message)}` },
      { status: 200 },
    );
  }

  if (topic) {
    rows = rows.filter((r) => parseJsonArray(r.topic_tags).includes(topic));
  }
  if (difficulty) rows = rows.filter((r) => r.difficulty === difficulty);

  return NextResponse.json({ problems: rows });
}
