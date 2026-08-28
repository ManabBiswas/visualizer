import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { isValidId, stripControlChars } from "@/lib/security/validate";

const MAX_ANSWER_CHARS = 2000;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  }

  const result = db
    .prepare("UPDATE notes SET answer = ? WHERE id = ? AND tag_type = 'q'")
    .run(clean || null, id);
  if (result.changes === 0) {
    return NextResponse.json({ error: "Quiz card not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
