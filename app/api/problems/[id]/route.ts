import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to view problems." }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid problem id." }, { status: 400 });
  }
  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not open the problem log: ${redactSecrets((err as Error).message)}` },
      { status: 503 },
    );
  }

  // Ownership check via user_id — a foreign problem is indistinguishable
  // from a nonexistent one so ids can't be probed.
  const problem = db
    .prepare("SELECT * FROM problems WHERE id = ? AND user_id = ?")
    .get(id, userId) as
    | { id: string; name: string; link: string | null; topic_tags: string; difficulty: string | null; source_code: string; created_at: string }
    | undefined;
  if (!problem) {
    return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  }

  const analysis = db
    .prepare("SELECT * FROM analyses WHERE problem_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(id);
  const notes = db
    .prepare("SELECT tag_type, text, line_number FROM notes WHERE problem_id = ? ORDER BY line_number")
    .all(id);

  let topicTags: string[] = [];
  try {
    topicTags = JSON.parse(problem.topic_tags || "[]");
  } catch {
    topicTags = [];
  }

  return NextResponse.json({
    problem: {
      id: problem.id,
      name: problem.name,
      link: problem.link,
      topicTags,
      difficulty: problem.difficulty,
      sourceCode: problem.source_code,
      createdAt: problem.created_at,
    },
    analysis,
    notes,
  });
}
