// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computeProgressStats,
  type ProgressCardRow,
  type ProgressProblemRow,
} from "./stats";

// Fixed "now" so every test is deterministic: 2026-09-01T10:00 local-ish.
// We anchor to a fixed date and let the module use local time consistently.
const NOW = new Date("2026-09-01T10:00:00").getTime();
const DAY = 24 * 60 * 60 * 1000;

function card(partial: Partial<ProgressCardRow> = {}): ProgressCardRow {
  return {
    noteId: "n1",
    problemId: "p1",
    topics: ["Array"],
    lastReviewed: null,
    state: null,
    ...partial,
  };
}

function problem(partial: Partial<ProgressProblemRow> = {}): ProgressProblemRow {
  return {
    problemId: "p1",
    topics: ["Array"],
    createdAt: new Date(NOW).toISOString(),
    ...partial,
  };
}

describe("computeProgressStats — totals", () => {
  it("counts problems, cards, reviewed cards and due cards", () => {
    const stats = computeProgressStats(
      [
        card({ noteId: "a" }), // new card -> due
        card({
          noteId: "b",
          lastReviewed: new Date(NOW - DAY).toISOString(),
          state: {
            repetitions: 2,
            easeFactor: 2.6,
            intervalDays: 6,
            dueDate: new Date(NOW - DAY).toISOString(), // reviewed yesterday, due yesterday -> due
            lastReviewed: new Date(NOW - DAY).toISOString(),
          },
        }),
        card({
          noteId: "c",
          lastReviewed: new Date(NOW - DAY).toISOString(),
          state: {
            repetitions: 3,
            easeFactor: 2.5,
            intervalDays: 15,
            dueDate: new Date(NOW + 5 * DAY).toISOString(), // not due
            lastReviewed: new Date(NOW - DAY).toISOString(),
          },
        }),
      ],
      [problem(), problem({ problemId: "p2" })],
      NOW,
    );
    expect(stats.totals).toEqual({
      problems: 2,
      cards: 3,
      reviewedCards: 2,
      dueToday: 2,
      streak: 2,
    });
  });

  it("returns zeroed totals for empty input", () => {
    const stats = computeProgressStats([], [], NOW);
    expect(stats.totals.problems).toBe(0);
    expect(stats.totals.cards).toBe(0);
    expect(stats.totals.reviewedCards).toBe(0);
    expect(stats.totals.dueToday).toBe(0);
    expect(stats.totals.streak).toBe(0);
  });
});

describe("computeProgressStats — topics", () => {
  it("aggregates cards per topic with average ease and due ratio", () => {
    const stats = computeProgressStats(
      [
        card({
          topics: ["DP", "Array"],
          state: { repetitions: 1, easeFactor: 1.4, intervalDays: 1, dueDate: new Date(NOW).toISOString(), lastReviewed: new Date(NOW).toISOString() },
        }),
        card({
          noteId: "n2",
          topics: ["DP"],
          state: { repetitions: 3, easeFactor: 2.6, intervalDays: 15, dueDate: new Date(NOW + DAY).toISOString(), lastReviewed: new Date(NOW).toISOString() },
        }),
        card({ noteId: "n3", topics: ["DP"] }), // never reviewed -> due, no ease
      ],
      [],
      NOW,
    );
    const dp = stats.topics.find((t) => t.topic === "DP")!;
    expect(dp.cards).toBe(3);
    expect(dp.avgEase).toBeCloseTo((1.4 + 2.6) / 2);
    // 2 of 3 due (the overdue one + the never-reviewed one)
    expect(dp.dueRatio).toBeCloseTo(2 / 3);
  });

  it("sorts topics by card count desc then name", () => {
    const stats = computeProgressStats(
      [card({ topics: ["Stack"] }), card({ noteId: "b", topics: ["DP"] }), card({ noteId: "c", topics: ["DP", "Array"] })],
      [],
      NOW,
    );
    // DP has 2 cards -> first; Array and Stack tie -> alphabetical.
    expect(stats.topics.map((t) => t.topic)).toEqual(["DP", "Array", "Stack"]);
  });
});

describe("computeProgressStats — heatmap", () => {
  it("always returns 30 days, oldest first, keyed by local date", () => {
    const stats = computeProgressStats([], [], NOW);
    expect(stats.heatmap).toHaveLength(30);
    expect(stats.heatmap[0].date < stats.heatmap[29].date).toBe(true);
  });

  it("buckets problem saves and card reviews into the right days", () => {
    const stats = computeProgressStats(
      [
        card({ lastReviewed: new Date(NOW - 2 * DAY).toISOString() }),
        card({ noteId: "n2", lastReviewed: new Date(NOW).toISOString() }),
      ],
      [problem({ createdAt: new Date(NOW - 2 * DAY).toISOString() })],
      NOW,
    );
    const todayKey = stats.heatmap[29].date;
    const twoDaysAgo = stats.heatmap[27];
    expect(todayKey).toBe(
      `${new Date(NOW).getFullYear()}-${String(new Date(NOW).getMonth() + 1).padStart(2, "0")}-${String(new Date(NOW).getDate()).padStart(2, "0")}`
    );
    expect(twoDaysAgo).toEqual({ date: twoDaysAgo.date, problems: 1, reviews: 1 });
    expect(stats.heatmap[29].reviews).toBe(1);
  });
});

describe("computeProgressStats — streak", () => {
  it("counts consecutive active days ending today", () => {
    const mk = (d: number) => new Date(NOW - d * DAY).toISOString();
    const stats = computeProgressStats(
      [card({ lastReviewed: mk(0) }), card({ noteId: "b", lastReviewed: mk(1) }), card({ noteId: "c", lastReviewed: mk(2) })],
      [],
      NOW,
    );
    expect(stats.totals.streak).toBe(3);
  });

  it("keeps the streak when today is idle but yesterday was active", () => {
    const mk = (d: number) => new Date(NOW - d * DAY).toISOString();
    const stats = computeProgressStats(
      [card({ lastReviewed: mk(1) }), card({ noteId: "b", lastReviewed: mk(2) })],
      [],
      NOW,
    );
    expect(stats.totals.streak).toBe(2);
  });

  it("breaks the streak after a gap", () => {
    const mk = (d: number) => new Date(NOW - d * DAY).toISOString();
    const stats = computeProgressStats(
      [card({ lastReviewed: mk(1) }), card({ noteId: "b", lastReviewed: mk(3) })],
      [],
      NOW,
    );
    expect(stats.totals.streak).toBe(1);
  });

  it("counts problem saves toward the streak even without reviews", () => {
    const stats = computeProgressStats(
      [],
      [problem(), problem({ problemId: "p2", createdAt: new Date(NOW - DAY).toISOString() })],
      NOW,
    );
    expect(stats.totals.streak).toBe(2);
  });
});
