// Progress dashboard statistics — pure functions over quiz/problem rows so
// everything is unit-testable without a database. The API route does the SQL
// joins; this module owns the interpretation.

import type { CardState } from "@/lib/spaced/repetition";

/** One row per q-tagged note, joined with its problem + card state. */
export type ProgressCardRow = {
  noteId: string;
  problemId: string;
  topics: string[];
  /** ISO timestamp — null when the card has never been reviewed. */
  lastReviewed: string | null;
  state: CardState | null;
};

/** One row per solved problem. */
export type ProgressProblemRow = {
  problemId: string;
  topics: string[];
  /** ISO timestamp of when the problem was saved. */
  createdAt: string;
};

export type TopicStat = {
  topic: string;
  /** Card count with this topic tag (problem-level tags). */
  cards: number;
  /** Average ease factor of reviewed cards — lower = weaker mastery. */
  avgEase: number | null;
  /** Share of this topic's cards that are due right now (0..1). */
  dueRatio: number;
};

export type HeatmapDay = {
  /** Local YYYY-MM-DD key. */
  date: string;
  /** Problems saved on this day. */
  problems: number;
  /** Cards reviewed on this day. */
  reviews: number;
};

export type ProgressStats = {
  totals: {
    problems: number;
    cards: number;
    reviewedCards: number;
    dueToday: number;
    /** Consecutive days (ending today or yesterday) with any activity. */
    streak: number;
  };
  topics: TopicStat[];
  /** Most recent `days` days, oldest first — ready for heatmap rendering. */
  heatmap: HeatmapDay[];
};

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Computes all dashboard stats. `now` defaults to the wall clock but is
 * injectable for deterministic tests. Timezone is the server's local one.
 */
export function computeProgressStats(
  cards: ProgressCardRow[],
  problems: ProgressProblemRow[],
  now: number = Date.now(),
): ProgressStats {
  let reviewedCards = 0;
  let dueToday = 0;

  // Topic aggregation: problem topics apply to every card of that problem.
  const byTopic = new Map<string, { cards: number; easeSum: number; easeN: number; due: number }>();
  for (const c of cards) {
    const isDue = c.state ? new Date(c.state.dueDate).getTime() <= now : true;
    if (isDue) dueToday += 1;
    if (c.lastReviewed) reviewedCards += 1;

    for (const t of c.topics) {
      let agg = byTopic.get(t);
      if (!agg) {
        agg = { cards: 0, easeSum: 0, easeN: 0, due: 0 };
        byTopic.set(t, agg);
      }
      agg.cards += 1;
      if (c.state) {
        agg.easeSum += c.state.easeFactor;
        agg.easeN += 1;
      }
      if (isDue) agg.due += 1;
    }
  }

  const topics: TopicStat[] = [...byTopic.entries()]
    .map(([topic, agg]) => ({
      topic,
      cards: agg.cards,
      avgEase: agg.easeN > 0 ? agg.easeSum / agg.easeN : null,
      dueRatio: agg.cards > 0 ? agg.due / agg.cards : 0,
    }))
    .sort((a, b) => b.cards - a.cards || a.topic.localeCompare(b.topic));

  // 30-day activity heatmap keyed by local day.
  const heat = new Map<string, { problems: number; reviews: number }>();
  const bump = (key: string, kind: "problems" | "reviews") => {
    const e = heat.get(key) ?? { problems: 0, reviews: 0 };
    e[kind] += 1;
    heat.set(key, e);
  };
  for (const p of problems) {
    const ts = new Date(p.createdAt).getTime();
    if (!Number.isNaN(ts)) bump(dayKey(ts), "problems");
  }
  for (const c of cards) {
    if (!c.lastReviewed) continue;
    const ts = new Date(c.lastReviewed).getTime();
    if (!Number.isNaN(ts)) bump(dayKey(ts), "reviews");
  }

  const days = 30;
  const today = startOfDay(now);
  const heatmap: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(today - i * DAY_MS);
    const e = heat.get(key) ?? { problems: 0, reviews: 0 };
    heatmap.push({ date: key, ...e });
  }

  // Streak: consecutive days with problems>0 or reviews>0, counting today
  // (or yesterday, so an idle today doesn't zero the streak immediately).
  const active = (key: string) => {
    const e = heat.get(key);
    return !!e && (e.problems > 0 || e.reviews > 0);
  };
  let streak = 0;
  let cursor = today;
  if (!active(dayKey(cursor))) cursor -= DAY_MS; // allow "yesterday" streaks
  while (active(dayKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  return {
    totals: {
      problems: problems.length,
      cards: cards.length,
      reviewedCards,
      dueToday,
      streak,
    },
    topics,
    heatmap,
  };
}
