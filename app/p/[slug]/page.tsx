import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDb } from "@/lib/db/init";
import { isValidShareSlug } from "@/lib/share/slug";
import { SharedProblemView, type MethodSummary, type SharedProblem } from "./view";


type Props = { params: Promise<{ slug: string }> };

async function loadShared(slug: string): Promise<SharedProblem | null> {
  if (!isValidShareSlug(slug)) return null;
  let row:
    | {
        name: string;
        link: string | null;
        difficulty: string | null;
        topic_tags: string;
        source_code: string;
        created_at: string;
      }
    | undefined;
  try {
    const db = getDb();
    row = db
      .prepare(
        `SELECT name, link, difficulty, topic_tags, source_code, created_at
         FROM problems WHERE share_slug = ?`
      )
      .get(slug) as typeof row;
  } catch {
    return null;
  }
  if (!row) return null;
  let topicTags: string[] = [];
  try {
    topicTags = JSON.parse(row.topic_tags || "[]");
  } catch {
    topicTags = [];
  }
  return {
    name: row.name,
    link: row.link,
    difficulty: row.difficulty,
    topicTags,
    sourceCode: row.source_code,
    createdAt: row.created_at,
  };
}

async function loadMethods(slug: string): Promise<MethodSummary[]> {
  // Methods come from the problem's latest analysis batch. The DB layout
  // stores the full ProgramIR per analysis row; the summary columns are the
  // stable contract we can rely on across schema tweaks.
  try {
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT a.method_name, a.time_complexity, a.space_complexity, a.time_confidence, a.space_confidence
         FROM analyses a
         JOIN problems p ON p.id = a.problem_id
         WHERE p.share_slug = ?
         ORDER BY a.created_at DESC`
      )
      .all(slug) as Array<{
        method_name: string | null;
        time_complexity: string | null;
        space_complexity: string | null;
        time_confidence: string | null;
        space_confidence: string | null;
      }>;
    // Dedupe method names keeping the newest (first) row per method.
    const seen = new Set<string>();
    const methods: MethodSummary[] = [];
    for (const r of rows) {
      const name = r.method_name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      methods.push({
        name,
        timeBigO: r.time_complexity,
        spaceBigO: r.space_complexity,
        timeConfidence: r.time_confidence,
        spaceConfidence: r.space_confidence,
      });
    }
    return methods;
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const problem = await loadShared(slug);
  if (!problem) return { title: "Not found" };
  return {
    title: `${problem.name} — shared analysis | CodeLens`,
    description: `Big-O analysis, flowchart and revision notes for ${problem.name}${
      problem.difficulty ? ` (${problem.difficulty})` : ""
    }, shared via CodeLens.`,
    robots: { index: false, follow: false },
  };
}

export default async function SharedProblemPage({ params }: Props) {
  const { slug } = await params;
  const problem = await loadShared(slug);
  if (!problem) notFound();

  const methods = await loadMethods(slug);
  const notes = await (async () => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          `SELECT n.tag_type, n.text, n.line_number
           FROM notes n JOIN problems p ON p.id = n.problem_id
           WHERE p.share_slug = ?
           ORDER BY n.line_number`
        )
        .all(slug) as Array<{ tag_type: string; text: string; line_number: number | null }>;
      return rows;
    } catch {
      return [];
    }
  })();

  return (
    <SharedProblemView
      problem={problem}
      methods={methods}
      notes={notes.map((n) => ({ tag: n.tag_type, text: n.text, line: n.line_number }))}
    />
  );
}
