import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { isValidId } from "@/lib/security/validate";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid problem id." }, { status: 400 });
  }
  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not open the problem log: ${(err as Error).message}` },
      { status: 503 },
    );
  }

  const problem = db.prepare("SELECT * FROM problems WHERE id = ?").get(id) as
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
