"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TOPICS } from "@/lib/topics";
import { logToMarkdown, logToCsv, LogExportRow } from "@/lib/export/log";
import { downloadText } from "@/lib/export/download";
import { isSafeHttpUrl } from "@/lib/security/validate";

type ProblemRow = {
  id: string;
  name: string;
  link: string | null;
  topic_tags: string;
  difficulty: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  note_count: number;
  created_at: string;
};

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-error",
};

function parseTopics(raw: string | null): string[] {
  try {
    return JSON.parse(raw || "[]");
  } catch {
    return [];
  }
}

export default function LogPage() {
  const router = useRouter();
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [topicFilter, setTopicFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (topicFilter) params.set("topic", topicFilter);
    if (difficultyFilter) params.set("difficulty", difficultyFilter);
    fetch(`/api/problems?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setProblems(d.problems);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicFilter, difficultyFilter]);

  function exportRows(): LogExportRow[] {
    return problems.map((p) => ({
      name: p.name,
      link: p.link,
      topics: parseTopics(p.topic_tags),
      difficulty: p.difficulty,
      time_complexity: p.time_complexity,
      space_complexity: p.space_complexity,
      note_count: p.note_count,
      created_at: p.created_at,
    }));
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-panel-padding">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-headline-md text-text-high-contrast">Problem Log</h1>
        <div className="flex flex-wrap gap-3">
          <select
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.target.value);
              setLoading(true);
            }}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface"
            aria-label="Filter by topic"
          >
            <option value="">All topics</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) => {
              setDifficultyFilter(e.target.value);
              setLoading(true);
            }}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface"
            aria-label="Filter by difficulty"
          >
            <option value="">All difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <button
            disabled={problems.length === 0}
            onClick={() => downloadText(logToMarkdown(exportRows()), "codelens-log.md", "text/markdown")}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Export the filtered log as a Markdown revision doc"
          >
            Markdown
          </button>
          <button
            disabled={problems.length === 0}
            onClick={() => downloadText(logToCsv(exportRows()), "codelens-log.csv", "text/csv")}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Export the filtered log as CSV"
          >
            CSV
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-body-sm text-text-muted">Loading…</p>
      ) : problems.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-body-sm text-text-muted">
          Solve your first problem to start building your revision log.
        </div>
      ) : (
        <table className="w-full border-collapse text-body-sm">
          <thead>
            <tr className="border-b border-panel-border text-left text-text-muted">
              <th className="py-2 font-medium">Problem</th>
              <th className="py-2 font-medium">Topic</th>
              <th className="py-2 font-medium">Difficulty</th>
              <th className="py-2 font-medium">Time</th>
              <th className="py-2 font-medium">Space</th>
              <th className="py-2 font-medium">Notes</th>
              <th className="py-2 font-medium">Solved</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p) => (
              <tr
                key={p.id}
                onClick={() => router.push(`/analyze?problem=${p.id}`)}
                className="cursor-pointer border-b border-panel-border hover:bg-surface-container-low"
                title="Open this problem in the editor"
              >
                <td className="py-2 text-on-surface">
                  {p.link && isSafeHttpUrl(p.link) ? (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="hover:text-primary"
                    >
                      {p.name}
                    </a>
                  ) : (
                    p.name
                  )}
                </td>
                <td className="py-2 text-on-surface-variant">{parseTopics(p.topic_tags).join(", ")}</td>
                <td className={`py-2 ${p.difficulty ? DIFFICULTY_COLOR[p.difficulty] : ""}`}>{p.difficulty}</td>
                <td className="py-2 font-mono text-code-sm text-on-surface">{p.time_complexity}</td>
                <td className="py-2 font-mono text-code-sm text-on-surface">{p.space_complexity}</td>
                <td className="py-2 text-on-surface-variant">{p.note_count}</td>
                <td className="py-2 text-text-muted">{new Date(p.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
