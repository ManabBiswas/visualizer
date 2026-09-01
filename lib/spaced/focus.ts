// Focus-session selection: the "drill your weakest topics" feature. Pure and
// deterministic so the selection logic is testable without a database.

import { DEFAULT_EASE } from "@/lib/spaced/repetition";

/** The minimal card shape pickFocusSession needs (quiz API rows map onto it). */
export type FocusCard = {
  id: string;
  topics: string[];
  /** Average ease factor of the card; null when never reviewed. */
  easeFactor: number | null;
  /** True when the card is due now (or new). */
  due: boolean;
};

export type FocusSession = {
  /** Selected cards, weakest topics first. */
  cards: FocusCard[];
  /** Distinct topics covered, weakest first — for the UI banner. */
  topics: string[];
};

// A never-reviewed card is treated as maximally weak: it hasn't proven
// anything yet. Slightly below MIN_EASE so it drills before lapsed cards.
const UNREVIEWED_EASE = 1.0;

// Cards with no topic tags are grouped under a "" bucket so they stay
// selectable; the key derivation is shared by the aggregation and the
// bucketing pass so the two can never disagree.
function topicKeys(topics: string[]): string[] {
  return topics.length > 0 ? topics : [""];
}

/**
 * Builds a focus session: up to `count` cards from the user's weakest topics.
 *
 * Weakest topic = lowest average ease (never-reviewed cards pull the average
 * down). Cards are picked due-first (a non-due card from a weak topic loses
 * its slot to a due one from the same topic), then by weakest ease within a
 * topic. Topics are interleaved round-robin so a single huge topic doesn't
 * monopolize the session.
 */
export function pickFocusSession(cards: FocusCard[], count = 10): FocusSession {
  if (cards.length === 0 || count <= 0) return { cards: [], topics: [] };

  // Aggregate ease per topic (untagged cards under "").
  const topicEase = new Map<string, { sum: number; n: number }>();
  for (const c of cards) {
    for (const t of topicKeys(c.topics)) {
      const agg = topicEase.get(t) ?? { sum: 0, n: 0 };
      agg.sum += c.easeFactor ?? UNREVIEWED_EASE;
      agg.n += 1;
      topicEase.set(t, agg);
    }
  }

  // Weakest topics first (avg ease ascending, then name for stability).
  const weakestTopics = [...topicEase.entries()]
    .map(([topic, agg]) => ({ topic, avg: agg.n > 0 ? agg.sum / agg.n : DEFAULT_EASE }))
    .sort((a, b) => a.avg - b.avg || a.topic.localeCompare(b.topic))
    .map((t) => t.topic);

  // Buckets per topic, due-first then weakest ease.
  const byTopic = new Map<string, FocusCard[]>();
  for (const c of cards) {
    for (const t of topicKeys(c.topics)) {
      const bucket = byTopic.get(t) ?? [];
      bucket.push(c);
      byTopic.set(t, bucket);
    }
  }
  for (const bucket of byTopic.values()) {
    bucket.sort(
      (a, b) =>
        Number(b.due) - Number(a.due) ||
        (a.easeFactor ?? UNREVIEWED_EASE) - (b.easeFactor ?? UNREVIEWED_EASE) ||
        a.id.localeCompare(b.id)
    );
  }

  // Round-robin across topics, weakest first, until the session is full.
  // Multi-topic cards can appear in several buckets — the seen-set keeps
  // every card in the session at most once.
  const picked: FocusCard[] = [];
  const seen = new Set<string>();
  const covered = new Set<string>();
  let round = 0;
  while (picked.length < count && round < count) {
    let progress = false;
    for (const t of weakestTopics) {
      if (picked.length >= count) break;
      const bucket = byTopic.get(t);
      if (bucket && bucket.length > round) {
        const candidate = bucket[round];
        covered.add(t);
        progress = true;
        if (seen.has(candidate.id)) continue;
        seen.add(candidate.id);
        picked.push(candidate);
      }
    }
    if (!progress) break;
    round += 1;
  }

  // Covered topics: only those that actually contributed a picked card.
  const contributing = new Set(picked.flatMap((c) => topicKeys(c.topics)));
  return { cards: picked, topics: weakestTopics.filter((t) => contributing.has(t)) };
}
