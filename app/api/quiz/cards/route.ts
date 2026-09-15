import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId, stripControlChars } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { isRateLimited } from "@/lib/security/rateLimit";

// Accepts reviewed AI-drafted quiz cards into the deck. This is the
// human-approval gate of the BYO-key drafting flow: the client shows drafts
// for editing, and ONLY explicitly accepted cards reach this route. Cards
// are stored as ordinary notes (tag_type='q') with source='ai' provenance.

const MAX_CARDS_PER_REQUEST = 10;
const MAX_QUESTION_CHARS = 300;
const MAX_ANSWER_CHARS = 1000;
const MAX_EXPLANATION_CHARS = 500;
const MCQ_CHOICES_COUNT = 4;

type IncomingCard = {
  question?: unknown;
  answer?: unknown;
  line?: unknown;
  choices?: unknown;
  correct_index?: unknown;
  explanation?: unknown;
};

function sanitizeCard(raw: IncomingCard): {
  question: string;
  answer: string;
  line: number | null;
  choices: string[] | null;
  correct_index: number | null;
  explanation: string | null;
} | null {
  if (typeof raw.question !== "string" || typeof raw.answer !== "string") return null;
  const question = stripControlChars(raw.question).trim().slice(0, MAX_QUESTION_CHARS);
  const answer = stripControlChars(raw.answer).trim().slice(0, MAX_ANSWER_CHARS);
  if (!question || !answer) return null;
  const line =
    typeof raw.line === "number" && Number.isInteger(raw.line) && raw.line >= 1 && raw.line <= 100_000
      ? raw.line
      : null;

  // MCQ fields
  let choices: string[] | null = null;
  let correct_index: number | null = null;
  let explanation: string | null = null;

  if (Array.isArray(raw.choices) && raw.choices.length === MCQ_CHOICES_COUNT) {
    const cleanChoices = raw.choices
      .map((choice) => (typeof choice === "string" ? stripControlChars(choice).trim().slice(0, MAX_ANSWER_CHARS) : ""))
      .filter((c) => c.length > 0);
    if (cleanChoices.length === MCQ_CHOICES_COUNT) {
      choices = cleanChoices;
    }
  }
  // Only accept correct_index if choices is also valid (complete MCQ)
  if (choices && typeof raw.correct_index === "number" && Number.isInteger(raw.correct_index) && raw.correct_index >= 0 && raw.correct_index < MCQ_CHOICES_COUNT) {
    correct_index = raw.correct_index;
  }
  // Only accept explanation if choices is also valid (complete MCQ)
  if (choices && typeof raw.explanation === "string") {
    const clean = stripControlChars(raw.explanation).trim().slice(0, MAX_EXPLANATION_CHARS);
    if (clean) explanation = clean;
  }

  return { question, answer, line, choices, correct_index, explanation };
}

export async function POST(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to add quiz cards." }, { status: 401 });
  }
  if (isRateLimited(`quizcards:${userId}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { problemId, cards } = (body ?? {}) as { problemId?: unknown; cards?: unknown };
  if (typeof problemId !== "string" || !isValidId(problemId)) {
    return NextResponse.json({ error: "Invalid `problemId`." }, { status: 400 });
  }
  if (!Array.isArray(cards) || cards.length === 0) {
    return NextResponse.json({ error: "`cards` must be a non-empty array." }, { status: 400 });
  }
  if (cards.length > MAX_CARDS_PER_REQUEST) {
    return NextResponse.json({ error: `Too many cards (max ${MAX_CARDS_PER_REQUEST}).` }, { status: 400 });
  }

  const clean = (cards as IncomingCard[])
    .map(sanitizeCard)
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (clean.length === 0) {
    return NextResponse.json({ error: "No usable cards in the request." }, { status: 400 });
  }

  try {
    // withDb + one explicit transaction: the dedupe-then-insert batch is
    // atomic, so concurrent accepts can't double-insert, and a stale Turso
    // stream heals + retries the whole block (the transaction makes it
    // idempotent).
    const result = withDb((db): string[] | null => {
      db.exec("BEGIN IMMEDIATE");
      try {
        // Ownership via the problem row; a foreign problem is indistinguishable
        // from a missing one.
        const problem = db
          .prepare("SELECT id FROM problems WHERE id = ? AND user_id = ?")
          .get(problemId, userId) as { id: string } | undefined;
        if (!problem) {
          db.exec("ROLLBACK");
          return null;
        }

        // Skip exact-duplicate questions already in this problem's deck —
        // re-accepting the same draft shouldn't double the card.
        const existing = new Set(
          (
            db
              .prepare("SELECT text FROM notes WHERE problem_id = ? AND tag_type = 'q'")
              .all(problemId) as Array<{ text: string }>
          ).map((r) => r.text),
        );

        const insert = db.prepare(
          `INSERT INTO notes (id, problem_id, tag_type, text, answer, line_number, choices, correct_index, explanation, source) VALUES (?, ?, 'q', ?, ?, ?, ?, ?, ?, 'ai')`,
        );
        const acceptedIds: string[] = [];
        for (const card of clean) {
          if (existing.has(card.question)) continue;
          const id = randomUUID();
          insert.run(id, problemId, card.question, card.answer, card.line, card.choices ? JSON.stringify(card.choices) : null, card.correct_index, card.explanation);
          acceptedIds.push(id);
        }
        db.exec("COMMIT");
        return acceptedIds;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    });

    if (result === null) {
      return NextResponse.json({ error: "Problem not found." }, { status: 404 });
    }
    return NextResponse.json({ accepted: result.length, ids: result });
  } catch (err) {
    return NextResponse.json({ error: redactSecrets((err as Error).message) }, { status: 503 });
  }
}
