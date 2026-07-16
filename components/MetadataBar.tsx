"use client";

export type ProblemMeta = {
  name: string;
  link: string;
  topicTags: string[];
  difficulty: "Easy" | "Medium" | "Hard" | "";
};

const TOPICS = [
  "Array", "String", "Two Pointer", "Sliding Window", "Hash Map", "Stack", "Queue",
  "Linked List", "Tree", "Graph", "Heap", "DP", "Backtracking", "Greedy",
  "Binary Search", "Bit Manipulation", "Other",
];

export function MetadataBar({ meta, onChange }: { meta: ProblemMeta; onChange: (m: ProblemMeta) => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-4 divide-x divide-panel-border border-b border-panel-border bg-surface-container-lowest px-container-margin text-body-sm">
      <input
        value={meta.name}
        onChange={(e) => onChange({ ...meta, name: e.target.value })}
        placeholder="Problem name"
        className="w-48 bg-transparent text-on-surface outline-none placeholder:text-text-muted"
      />
      <input
        value={meta.link}
        onChange={(e) => onChange({ ...meta, link: e.target.value })}
        placeholder="Link (optional)"
        className="w-56 bg-transparent pl-4 text-on-surface outline-none placeholder:text-text-muted"
      />
      <select
        value={meta.topicTags[0] ?? ""}
        onChange={(e) => onChange({ ...meta, topicTags: e.target.value ? [e.target.value] : [] })}
        className="bg-transparent pl-4 text-on-surface outline-none"
      >
        <option value="">Topic</option>
        {TOPICS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <select
        value={meta.difficulty}
        onChange={(e) => onChange({ ...meta, difficulty: e.target.value as ProblemMeta["difficulty"] })}
        className="bg-transparent pl-4 text-on-surface outline-none"
      >
        <option value="">Difficulty</option>
        <option value="Easy">Easy</option>
        <option value="Medium">Medium</option>
        <option value="Hard">Hard</option>
      </select>
    </div>
  );
}
