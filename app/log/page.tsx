"use client";

import { useEffect, useState } from "react";

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

export default function LogPage() {
  const [problems, setProblems] = useState<ProblemRow[]>([]);
  const [topicFilter, setTopicFilter] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams();
    if (topicFilter) params.set("topic", topicFilter);
    if (difficultyFilter) params.set("difficulty", difficultyFilter);
    setLoading(true);
    fetch(`/api/problems?${params}`)
      .then((r) => r.json())
      .then((d) => setProblems(d.problems))
      .finally(() => setLoading(false));
  }, [topicFilter, difficultyFilter]);

  return (
    <div className="flex h-full flex-col overflow-auto p-panel-padding">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-headline-md text-text-high-contrast">Problem Log</h1>
        <div className="flex gap-3">
          <select
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface"
          >
            <option value="">All topics</option>
            <option value="Array">Array</option>
            <option value="DP">DP</option>
            <option value="Graph">Graph</option>
            <option value="Tree">Tree</option>
            <option value="Two Pointer">Two Pointer</option>
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface"
          >
            <option value="">All difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
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
              <tr key={p.id} className="border-b border-panel-border hover:bg-surface-container-low">
                <td className="py-2 text-on-surface">
                  {p.link ? (
                    <a href={p.link} target="_blank" className="hover:text-primary">
                      {p.name}
                    </a>
                  ) : (
                    p.name
                  )}
                </td>
                <td className="py-2 text-on-surface-variant">{JSON.parse(p.topic_tags).join(", ")}</td>
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
