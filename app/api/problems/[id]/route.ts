import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId, parseJsonArray } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { isRateLimited } from "@/lib/security/rateLimit";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view problems." }, { status: 401 });
  }
  if (await isRateLimited(`problem:${userId}`, 90, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid problem id." }, { status: 400 });
  }

  try {
    // withDb: self-heals a stale Turso Hrana stream and retries the whole
    // read block once — a public-adjacent read must not 500 on evictions.
    return withDb((db) => {
      // Ownership check via user_id — a foreign problem is indistinguishable
      // from a nonexistent one so ids can't be probed.
      const problem = db
        .prepare("SELECT * FROM problems WHERE id = ? AND user_id = ?")
        .get(id, userId) as
        | { id: string; name: string; link: string | null; topic_tags: string; difficulty: string | null; source_code: string; language: string | null; created_at: string }
        | undefined;
      if (!problem) {
        return NextResponse.json({ error: "Problem not found." }, { status: 404 });
      }

      const analysis = db
        .prepare(
          "SELECT method_name, time_complexity, space_complexity, time_confidence, space_confidence, created_at FROM analyses WHERE problem_id = ? ORDER BY created_at DESC LIMIT 1",
        )
        .get(id);
      const notes = db
        .prepare("SELECT tag_type, text, line_number FROM notes WHERE problem_id = ? ORDER BY line_number")
        .all(id);

      const topicTags = parseJsonArray(problem.topic_tags);

      return NextResponse.json({
        problem: {
          id: problem.id,
          name: problem.name,
          link: problem.link,
          topicTags,
          difficulty: problem.difficulty,
          sourceCode: problem.source_code,
          language: problem.language === "python" ? "python" : "java",
          createdAt: problem.created_at,
        },
        analysis,
        notes,
      });
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read the problem log: ${redactSecrets((err as Error).message)}` },
      { status: 503 },
    );
  }
}
