// SM-2-inspired spaced repetition scheduler (simplified Anki-style).
// Pure and deterministic given `now` — no DB or clock access here.

export type Grade = "again" | "good" | "easy";

export type CardState = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueDate: string; // ISO timestamp
  lastReviewed: string | null;
};

export const GRADES: readonly Grade[] = ["again", "good", "easy"];

export const MIN_EASE = 1.3;
export const DEFAULT_EASE = 2.5;

export function newCardState(now = Date.now()): CardState {
  return {
    repetitions: 0,
    easeFactor: DEFAULT_EASE,
    intervalDays: 0,
    dueDate: new Date(now).toISOString(),
    lastReviewed: null,
  };
}

function addDays(now: number, days: number): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Computes the next review state for a card given a grade.
 * - again: lapse — relearn today, ease drops (floor 1.3)
 * - good: 1d -> 6d -> interval * ease
 * - easy: accelerated graduation, ease grows
 */
export function schedule(state: CardState, grade: Grade, now = Date.now()): CardState {
  const reviewed = new Date(now).toISOString();

  if (grade === "again") {
    return {
      repetitions: 0,
      easeFactor: Math.max(MIN_EASE, state.easeFactor - 0.2),
      intervalDays: 0,
      dueDate: reviewed, // due again immediately
      lastReviewed: reviewed,
    };
  }

  const repetitions = state.repetitions + 1;
  let easeFactor = state.easeFactor;
  let intervalDays: number;

  if (grade === "easy") {
    easeFactor = Math.min(3.0, easeFactor + 0.15);
    intervalDays = repetitions === 1 ? 4 : Math.max(1, Math.round(state.intervalDays * easeFactor * 1.3));
  } else {
    // good
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.max(1, Math.round(state.intervalDays * easeFactor));
  }

  return {
    repetitions,
    easeFactor,
    intervalDays,
    dueDate: addDays(now, intervalDays),
    lastReviewed: reviewed,
  };
}

export function isDue(state: CardState | null, now = Date.now()): boolean {
  if (!state) return true; // never reviewed
  return new Date(state.dueDate).getTime() <= now;
}
