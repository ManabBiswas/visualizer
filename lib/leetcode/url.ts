// LeetCode URL import — pure helpers shared by the API route and tests.
// The route stays thin; everything testable lives here.
//
// Security posture: the ONLY thing that reaches the outbound fetch is the
// slug extracted here, and only after a strict host allowlist check. We never
// proxy arbitrary URLs (SSRF guard), and the slug is validated to
// [a-z0-9-]+ before it is used.

import type { ProblemMeta } from "@/components/MetadataBar";

const LEETCODE_HOSTS = new Set(["leetcode.com", "www.leetcode.com"]);
const MAX_SLUG_CHARS = 128;

/**
 * Extracts the problem slug from a LeetCode URL, or returns null when the
 * URL isn't a leetcode.com problem page. Accepts trailing slashes,
 * /description/ suffixes and query strings.
 *
 *   https://leetcode.com/problems/two-sum/                     -> "two-sum"
 *   https://leetcode.com/problems/two-sum/description/?env=study-plan -> "two-sum"
 *   https://evil.com/problems/two-sum/                          -> null
 */
export function parseLeetCodeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!LEETCODE_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/problems\/([a-z0-9-]+)/i);
  const slug = match?.[1]?.toLowerCase() ?? null;
  if (!slug || slug.length > MAX_SLUG_CHARS) return null;
  return slug;
}

/**
 * Raw question shape from LeetCode's GraphQL `question(titleSlug:)` field.
 * `question` is null for unknown slugs.
 */
export type LeetCodeQuestion = {
  title?: unknown;
  titleSlug?: unknown;
  difficulty?: unknown;
  topicTags?: unknown;
};

// LeetCode tag name -> our TOPICS taxonomy. Known mappings are normalized;
// unmapped tags pass through unchanged (problem tags are free-form strings
// everywhere downstream; the log filters just won't offer them).
const TAG_MAP: Record<string, string> = {
  "Hash Table": "Hash Map",
  "Depth-First Search": "Graph",
  "Breadth-First Search": "Graph",
  "Dynamic Programming": "DP",
  "Two Pointers": "Two Pointer",
  "Sliding Window": "Sliding Window",
  "Binary Search": "Binary Search",
  "Bit Manipulation": "Bit Manipulation",
  "Linked List": "Linked List",
};

const MAX_TAGS = 8;
const MAX_TAG_CHARS = 50;

/**
 * Maps a LeetCode GraphQL question into our ProblemMeta, or returns null
 * when the payload is unusable (missing title/difficulty). Difficulty stays
 * empty when LeetCode reports a value outside Easy/Medium/Hard.
 */
export function questionToMeta(q: LeetCodeQuestion): ProblemMeta | null {
  const title = typeof q.title === "string" ? q.title.trim() : "";
  const slug = typeof q.titleSlug === "string" ? q.titleSlug.trim() : "";
  if (!title || !slug) return null;

  const rawTags = Array.isArray(q.topicTags) ? q.topicTags : [];
  const tags: string[] = [];
  for (const t of rawTags) {
    const name = typeof t === "object" && t !== null && "name" in t ? String((t as { name: unknown }).name).trim() : "";
    if (!name) continue;
    const mapped = TAG_MAP[name] ?? name;
    const clean = mapped.slice(0, MAX_TAG_CHARS);
    if (!tags.includes(clean)) tags.push(clean);
    if (tags.length >= MAX_TAGS) break;
  }

  const difficultyRaw = typeof q.difficulty === "string" ? q.difficulty.trim() : "";
  const difficulty = (["Easy", "Medium", "Hard"] as const).includes(difficultyRaw as never)
    ? (difficultyRaw as ProblemMeta["difficulty"])
    : "";

  return {
    name: title,
    link: `https://leetcode.com/problems/${slug}/`,
    topicTags: tags,
    difficulty,
  };
}

/** The GraphQL query sent to leetcode.com — kept here for reviewability. */
export const QUESTION_QUERY = `query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    title
    titleSlug
    difficulty
    topicTags { name }
  }
}`;
