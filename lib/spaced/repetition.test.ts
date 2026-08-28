import { describe, it, expect } from "vitest";
import { newCardState, schedule, isDue, MIN_EASE, DEFAULT_EASE } from "./repetition";

const NOW = Date.parse("2026-08-28T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("schedule", () => {
  it("graduates a new card to 1 day on 'good'", () => {
    const next = schedule(newCardState(NOW), "good", NOW);
    expect(next.repetitions).toBe(1);
    expect(next.intervalDays).toBe(1);
    expect(new Date(next.dueDate).getTime()).toBe(NOW + DAY);
    expect(next.easeFactor).toBe(DEFAULT_EASE);
  });

  it("follows the 1d -> 6d -> interval*ease ladder", () => {
    let state = newCardState(NOW);
    state = schedule(state, "good", NOW); // 1d
    state = schedule(state, "good", NOW); // 6d
    expect(state.intervalDays).toBe(6);
    state = schedule(state, "good", NOW); // 6 * 2.5 = 15d
    expect(state.intervalDays).toBe(15);
  });

  it("'easy' accelerates and raises ease", () => {
    const next = schedule(newCardState(NOW), "easy", NOW);
    expect(next.intervalDays).toBe(4);
    expect(next.easeFactor).toBeCloseTo(DEFAULT_EASE + 0.15);
  });

  it("'again' lapses: due immediately, ease drops but never below the floor", () => {
    let state = schedule(newCardState(NOW), "good", NOW);
    state = schedule(state, "again", NOW + DAY);
    expect(state.repetitions).toBe(0);
    expect(state.intervalDays).toBe(0);
    expect(new Date(state.dueDate).getTime()).toBeLessThanOrEqual(NOW + DAY);
    expect(state.easeFactor).toBeCloseTo(DEFAULT_EASE - 0.2);

    for (let i = 0; i < 20; i++) state = schedule(state, "again", NOW);
    expect(state.easeFactor).toBe(MIN_EASE);
  });

  it("records lastReviewed", () => {
    const next = schedule(newCardState(NOW), "good", NOW);
    expect(next.lastReviewed).toBe(new Date(NOW).toISOString());
  });
});

describe("isDue", () => {
  it("never-reviewed cards are due", () => {
    expect(isDue(null, NOW)).toBe(true);
  });

  it("respects the due date", () => {
    const state = schedule(newCardState(NOW), "good", NOW); // due in 1 day
    expect(isDue(state, NOW)).toBe(false);
    expect(isDue(state, NOW + DAY + 1000)).toBe(true);
  });
});
