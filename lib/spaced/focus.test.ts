// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pickFocusSession, type FocusCard } from "./focus";

function card(
  id: string,
  topics: string[],
  easeFactor: number | null,
  due = true
): FocusCard {
  return { id, topics, easeFactor, due };
}

describe("pickFocusSession", () => {
  it("returns an empty session for an empty deck", () => {
    expect(pickFocusSession([])).toEqual({ cards: [], topics: [] });
  });

  it("picks cards from the weakest topics first", () => {
    const deck = [
      card("dp-1", ["DP"], 1.4), // weak topic
      card("dp-2", ["DP"], 1.5),
      card("arr-1", ["Array"], 2.8), // strong topic
      card("arr-2", ["Array"], 2.9),
    ];
    const session = pickFocusSession(deck, 2);
    // Round-robin: round 1 takes the weakest card of DP, then of Array.
    expect(session.cards.map((c) => c.id)).toEqual(["dp-1", "arr-1"]);
    expect(session.topics).toEqual(["DP", "Array"]);
  });

  it("drains the weakest topic before stronger ones when it has more cards than the count allows", () => {
    const deck = [
      card("dp-1", ["DP"], 1.4),
      card("dp-2", ["DP"], 1.5),
      card("arr-1", ["Array"], 2.8),
    ];
    const session = pickFocusSession(deck, 3);
    expect(session.cards.map((c) => c.id)).toEqual(["dp-1", "arr-1", "dp-2"]);
  });

  it("treats never-reviewed cards as the weakest and includes them", () => {
    const deck = [
      card("seen", ["DP"], 1.5),
      card("fresh", ["DP"], null),
      card("strong", ["Array"], 2.9),
    ];
    // fresh has the lowest ease; round 1 then adds the strongest topic's card.
    const session = pickFocusSession(deck, 2);
    expect(session.cards.map((c) => c.id)).toEqual(["fresh", "strong"]);
    expect(session.topics).toEqual(["DP", "Array"]);
  });

  it("prefers due cards over scheduled ones within a topic", () => {
    const deck = [
      card("scheduled", ["DP"], 1.3, false),
      card("due", ["DP"], 2.0, true),
    ];
    const session = pickFocusSession(deck, 1);
    expect(session.cards[0].id).toBe("due");
  });

  it("interleaves topics round-robin instead of draining one topic", () => {
    const deck = [
      card("dp-1", ["DP"], 1.3),
      card("dp-2", ["DP"], 1.4),
      card("dp-3", ["DP"], 1.5),
      card("heap-1", ["Heap"], 1.6),
      card("heap-2", ["Heap"], 1.7),
    ];
    // DP is weaker than Heap overall, so round 1 takes dp-1 + heap-1,
    // round 2 takes dp-2 + heap-2. dp-3 misses the cut.
    const session = pickFocusSession(deck, 4);
    expect(session.cards.map((c) => c.id)).toEqual(["dp-1", "heap-1", "dp-2", "heap-2"]);
    expect(session.topics).toEqual(["DP", "Heap"]);
  });

  it("caps the session at the requested count", () => {
    const deck = Array.from({ length: 20 }, (_, i) => card(`c${i}`, ["DP"], 1.5));
    expect(pickFocusSession(deck, 10).cards).toHaveLength(10);
  });

  it("handles untagged cards via the fallback bucket", () => {
    const deck = [card("no-topic", [], null), card("tagged", ["DP"], 2.5)];
    const session = pickFocusSession(deck, 2);
    expect(session.cards).toHaveLength(2);
    // The untagged card (ease 1.0) drills first.
    expect(session.cards[0].id).toBe("no-topic");
  });

  it("returns fewer cards when the deck is smaller than the count", () => {
    const deck = [card("a", ["DP"], 1.5), card("b", ["Array"], 2.5)];
    expect(pickFocusSession(deck, 10).cards).toHaveLength(2);
  });

  it("sorts ties deterministically by id", () => {
    const deck = [card("b", ["DP"], 1.5), card("a", ["DP"], 1.5)];
    expect(pickFocusSession(deck, 2).cards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("computes topic weakness as the average, not the minimum", () => {
    const deck = [
      card("dp-1", ["DP"], 1.3),
      card("dp-2", ["DP"], 2.7), // DP avg = 2.0
      card("heap-1", ["Heap"], 1.8),
      card("heap-2", ["Heap"], 1.9), // Heap avg = 1.85 -> weaker than DP
    ];
    const session = pickFocusSession(deck, 2);
    // Heap (avg 1.85) drills before DP (avg 2.0); round 1 also takes dp-1.
    expect(session.cards.map((c) => c.id)).toEqual(["heap-1", "dp-1"]);
    expect(session.topics).toEqual(["Heap", "DP"]);
  });

  it("never duplicates a multi-topic card in one session", () => {
    const deck = [
      card("both", ["DP", "Heap"], 1.3),
      card("dp-only", ["DP"], 1.4),
      card("heap-only", ["Heap"], 1.5),
    ];
    const session = pickFocusSession(deck, 3);
    const ids = session.cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("both");
  });
});
