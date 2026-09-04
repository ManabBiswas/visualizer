// Strict parsing + sanitizing of model output for quiz drafts.
//
// The model is untrusted: output is fence-stripped, JSON-parsed, and every
// card is individually sanitized (control chars stripped, length caps,
// optional integer line). Anything malformed is dropped, never thrown at
// the user — a 10-card draft where 3 survive is still useful.

import { stripControlChars } from "@/lib/security/validate";

export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_CHARS = 1000;
/** Hard cap on accepted drafts per run (mirrors the drawer's slider max). */
export const MAX_DRAFT_CARDS = 10;

export type DraftCard = {
  question: string;
  answer: string;
  line: number | null;
};

/** Removes ```json / ``` fences and trims. */
function stripFences(raw: string): string {
  let s = raw.trim();
  // Leading fence (with optional language tag) … trailing fence.
  s = s.replace(/^```[a-zA-Z0-9_-]*\s*\n?/, "").replace(/\n?```\s*$/, "");
  // Some models wrap the array in prose despite instructions; slice from
  // the first '[' or '{' to the last ']' or '}' before parsing.
  const firstArr = s.indexOf("[");
  const firstObj = s.indexOf("{");
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstArr, firstObj);
  if (start > 0) s = s.slice(start);
  const lastArr = s.lastIndexOf("]");
  const lastObj = s.lastIndexOf("}");
  const end = Math.max(lastArr, lastObj);
  if (end !== -1 && end < s.length - 1) s = s.slice(0, end + 1);
  return s.trim();
}

function sanitizeLine(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > 100_000) return null;
  return raw;
}

function sanitizeCard(raw: unknown): DraftCard | null {
  if (typeof raw !== "object" || raw === null) return null;
  const c = raw as { question?: unknown; answer?: unknown; line?: unknown };
  if (typeof c.question !== "string" || typeof c.answer !== "string") return null;

  const question = stripControlChars(c.question).trim().slice(0, MAX_QUESTION_CHARS);
  const answer = stripControlChars(c.answer).trim().slice(0, MAX_ANSWER_CHARS);
  if (!question || !answer) return null;

  return { question, answer, line: sanitizeLine(c.line) };
}

/**
 * Parses model output into sanitized draft cards. Accepts a bare JSON
 * array, or an object wrapping one under any plausible key ("cards",
 * "drafts", "quiz", …) — provider output shapes vary. Returns at most
 * MAX_DRAFT_CARDS cards; empty array when nothing usable survives.
 */
export function parseDraftCards(rawModelOutput: string): DraftCard[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(rawModelOutput));
  } catch {
    return [];
  }

  let list: unknown;
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const arrayVal = Object.values(obj).find((v) => Array.isArray(v));
    list = arrayVal ?? [];
  } else {
    return [];
  }

  const drafts: DraftCard[] = [];
  const seenQuestions = new Set<string>();
  for (const item of list as unknown[]) {
    if (drafts.length >= MAX_DRAFT_CARDS) break;
    const card = sanitizeCard(item);
    if (!card) continue;
    // Dedupe identical questions within one draft run.
    if (seenQuestions.has(card.question)) continue;
    seenQuestions.add(card.question);
    drafts.push(card);
  }
  return drafts;
}
