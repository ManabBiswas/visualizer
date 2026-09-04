// Grounded quiz-draft prompt builder — pure and deterministic.
//
// The prompt deliberately ships the analyzer's OWN verdicts (loop bounds,
// call targets, recursion, complexity + reasoning) alongside a source
// excerpt, so the model asks questions about THIS code rather than generic
// DSA trivia. Everything here is testable without any network access.

import type { MethodIR, ProgramIR } from "@/lib/ir";

/** Per-method deterministic facts fed to the model. */
export type MethodFacts = {
  name: string;
  signature: string;
  startLine: number;
  endLine: number;
  lines: number;
  loopLines: number[];
  loopBounds: string[];
  calls: string[];
  recursive: boolean;
  timeBigO: string | null;
  spaceBigO: string | null;
};

export type PromptFacts = {
  problemName: string;
  difficulty: string | null;
  topicTags: string[];
  methods: MethodFacts[];
};

/** Wire shape of a built prompt — consumed by the provider registry. */
export type PromptMessages = { system: string; user: string };

/** Cap for the source excerpt — keeps prompts (and provider cost) bounded. */
export const MAX_SOURCE_EXCERPT_CHARS = 15_000;
/** Hard cap on requested cards — mirrors the drawer's slider maximum. */
export const MAX_DRAFT_COUNT = 10;
export const MIN_DRAFT_COUNT = 3;

// Facts are derived from the IR + analyses, never from user free text
// beyond the source itself, so the model stays anchored to real code.
function factsFromIr(
  ir: ProgramIR,
  analyses: Array<{ method_name: string | null; time_complexity: string | null; space_complexity: string | null }>,
): PromptFacts {
  const complexityByMethod = new Map(analyses.map((a) => [a.method_name, a]));

  const methods: MethodFacts[] = [];
  for (const cls of ir.classes) {
    for (const m of cls.methods) {
      const loopLines: number[] = [];
      const loopBounds: string[] = [];
      const walk = (nodes: MethodIR["body"]) => {
        for (const n of nodes) {
          if (n.type === "loop") {
            loopLines.push(n.line);
            loopBounds.push(`${n.kind} (bound: ${n.boundType})`);
            walk(n.body);
          } else if (n.type === "if") {
            for (const b of n.branches) walk(b.body);
          } else if (n.type === "switch") {
            for (const c of n.cases) walk(c.body);
          } else if (n.type === "try") {
            walk(n.body);
            for (const c of n.catches) walk(c.body);
          }
        }
      };
      walk(m.body);

      const analysis = complexityByMethod.get(m.name);
      methods.push({
        name: m.name,
        signature: m.signature,
        startLine: m.startLine,
        endLine: m.endLine,
        lines: m.endLine - m.startLine + 1,
        loopLines,
        loopBounds,
        calls: m.calls,
        recursive: m.calls.includes(m.name),
        timeBigO: analysis?.time_complexity ?? null,
        spaceBigO: analysis?.space_complexity ?? null,
      });
    }
  }

  return {
     problemName: "",
     difficulty: null, 
     topicTags: [], 
     methods 
    };
}

/**
 * Builds the full prompt (system + user messages) for quiz drafting.
 * `source` is truncated at a line boundary to keep tokens bounded.
 */
export function buildQuizPrompt(
  meta: { name: string; difficulty: string | null; topicTags: string[] },
  ir: ProgramIR,
  analyses: Array<{ method_name: string | null; time_complexity: string | null; space_complexity: string | null }>,
  source: string,
  count: number,
): { system: string; user: string } {
  const safeCount = Math.min(MAX_DRAFT_COUNT, Math.max(MIN_DRAFT_COUNT, Math.floor(count) || 5));

  // Line-boundary truncation with a clear marker so the model knows the excerpt ended deliberately.
  let excerpt = source;
  if (excerpt.length > MAX_SOURCE_EXCERPT_CHARS) {
    excerpt = excerpt.slice(0, MAX_SOURCE_EXCERPT_CHARS);
    const lastNewline = excerpt.lastIndexOf("\n");
    if (lastNewline > 0) excerpt = excerpt.slice(0, lastNewline);
    excerpt += "\n// …(truncated)";
  }

  const baseFacts = factsFromIr(ir, analyses);
  const facts: PromptFacts = {
    problemName: meta.name,
    difficulty: meta.difficulty,
    topicTags: meta.topicTags,
    methods: baseFacts.methods,
  };

  const methodBlocks = facts.methods
    .map((m) => {
      const lines = [
        `- ${m.signature} (lines ${m.startLine}–${m.endLine}, ${m.lines} lines)`,
        m.loopLines.length > 0
          ? `  loops: ${m.loopBounds.join("; ")} at lines ${m.loopLines.join(", ")}`
          : "  loops: none",
        m.calls.length > 0 ? `  calls: ${m.calls.join(", ")}` : "  calls: none",
        m.recursive ? "  recursion: YES (calls itself)" : "  recursion: no",
        m.timeBigO ? `  analyzer time: ${m.timeBigO}` : null,
        m.spaceBigO ? `  analyzer space: ${m.spaceBigO}` : null,
      ].filter((l): l is string => l !== null);
      return lines.join("\n");
    })
    .join("\n");

  const system = [
    "You are a spaced-repetition quiz writer for Java DSA interview prep.",
    "You draft flashcards about the GIVEN code only. Never invent APIs, lines, or behaviors that are not present.",
    "Prefer 'why' questions (reasoning, invariants, edge cases, complexity trade-offs) over 'what' trivia.",
    "Every question must be answerable from the code or the provided analyzer facts.",
    "Reference specific lines or methods when it helps, but do not rely on line numbers being visible to the learner.",
    "Return ONLY a JSON array — no prose, no markdown fences. Shape:",
    '[{"question": string (max 300 chars), "answer": string (max 1000 chars), "line": number|null}]',
  ].join("\n");

  const user = [
    `Problem: ${facts.problemName || "(unnamed)"}`,
    facts.difficulty ? `Difficulty: ${facts.difficulty}` : null,
    facts.topicTags.length > 0 ? `Topics: ${facts.topicTags.join(", ")}` : null,
    "",
    "Deterministic analysis facts (from a static analyzer — treat as ground truth):",
    methodBlocks,
    "",
    `Java source (line numbers = 1-indexed):`,
    "```java",
    excerpt,
    "```",
    "",
    `Write exactly ${safeCount} quiz cards as the JSON array described.`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return { system, user };
}
