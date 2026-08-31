import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId, stripControlChars } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";

const MAX_ANSWER_CHARS = 2000;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to edit answers." }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid note id." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { answer } = (body ?? {}) as { answer?: unknown };
  if (typeof answer !== "string") {
    return NextResponse.json({ error: "`answer` must be a string." }, { status: 400 });
  }
  const clean = stripControlChars(answer).trim();
  if (clean.length > MAX_ANSWER_CHARS) {
    return NextResponse.json(
      { error: `Answer is too long (max ${MAX_ANSWER_CHARS} characters).` },
      { status: 400 },
    );
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json({ error: redactSecrets((err as Error).message) }, { status: 503 });
  }

  // Ownership flows through the note's problem -> user; only the owner's
  // quiz cards can be answered.
  const result = db
    .prepare(
      `UPDATE notes SET answer = ?
       WHERE id = ? AND tag_type = 'q'
         AND problem_id IN (SELECT id FROM problems WHERE user_id = ?)`,
    )
    .run(clean || null, id, userId);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Quiz card not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
