import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId, stripControlChars } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { isRateLimited } from "@/lib/security/rateLimit";

const MAX_TEXT_CHARS = 2000;
const VALID_TAG_TYPES = ["q", "note", "why", "complexity"] as const;

export async function POST(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to add notes." }, { status: 401 });
  }
  if (await isRateLimited(`notes:${userId}`, 90, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { problemId, tagType, text, lineNumber } = (body ?? {}) as {
    problemId?: unknown;
    tagType?: unknown;
    text?: unknown;
    lineNumber?: unknown;
  };

  if (typeof problemId !== "string" || !isValidId(problemId)) {
    return NextResponse.json({ error: "Invalid `problemId`." }, { status: 400 });
  }
  if (typeof tagType !== "string" || !VALID_TAG_TYPES.includes(tagType as "q" | "note" | "why" | "complexity")) {
    return NextResponse.json({ error: "`tagType` must be one of: q, note, why, complexity." }, { status: 400 });
  }
  if (typeof text !== "string") {
    return NextResponse.json({ error: "`text` must be a string." }, { status: 400 });
  }
  const cleanText = stripControlChars(text).trim().slice(0, MAX_TEXT_CHARS);
  if (!cleanText) {
    return NextResponse.json({ error: "Note text cannot be empty." }, { status: 400 });
  }
  if (lineNumber !== null && lineNumber !== undefined) {
    const line = Number(lineNumber);
    if (!Number.isInteger(line) || line < 1 || line > 100_000) {
      return NextResponse.json({ error: "`lineNumber` must be a positive integer ≤ 100000." }, { status: 400 });
    }
  }

  try {
    const noteId = withDb((db) => {
      // Ownership check: problem must belong to user
      const problem = db
        .prepare("SELECT id FROM problems WHERE id = ? AND user_id = ?")
        .get(problemId, userId) as { id: string } | undefined;
      if (!problem) {
        return null;
      }

      const id = randomUUID();
      db.prepare(
        `INSERT INTO notes (id, problem_id, tag_type, text, line_number, source) VALUES (?, ?, ?, ?, ?, 'user')`,
      ).run(id, problemId, tagType, cleanText, lineNumber ?? null);

      return id;
    });

    if (!noteId) {
      return NextResponse.json({ error: "Problem not found." }, { status: 404 });
    }

    return NextResponse.json({ id: noteId, ok: true });
  } catch (err) {
    return NextResponse.json({ error: redactSecrets((err as Error).message) }, { status: 503 });
  }
}