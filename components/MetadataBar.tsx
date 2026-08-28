"use client";

import { TOPICS } from "@/lib/topics";

export type ProblemMeta = {
  name: string;
  link: string;
  topicTags: string[];
  difficulty: "Easy" | "Medium" | "Hard" | "";
};

export function MetadataBar({ meta, onChange }: { meta: ProblemMeta; onChange: (m: ProblemMeta) => void }) {
  function addTopic(topic: string) {
    if (!topic || meta.topicTags.includes(topic)) return;
    onChange({ ...meta, topicTags: [...meta.topicTags, topic] });
  }

  function removeTopic(topic: string) {
    onChange({ ...meta, topicTags: meta.topicTags.filter((t) => t !== topic) });
  }

  return (
    <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 divide-x divide-panel-border border-b border-panel-border bg-surface-container-lowest px-container-margin py-1 text-body-sm">
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
      <div className="flex flex-wrap items-center gap-1.5 pl-4">
        {meta.topicTags.map((t) => (
          <span
            key={t}
            className="badge bg-primary-container/15 text-primary"
            title={`Remove ${t}`}
          >
            {t}
            <button
              onClick={() => removeTopic(t)}
              className="ml-1 text-text-muted hover:text-error"
              aria-label={`Remove topic ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        <select
          value=""
          onChange={(e) => addTopic(e.target.value)}
          className="bg-transparent text-on-surface outline-none"
          aria-label="Add topic"
        >
          <option value="">+ Topic</option>
          {TOPICS.filter((t) => !meta.topicTags.includes(t)).map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <select
        value={meta.difficulty}
        onChange={(e) => onChange({ ...meta, difficulty: e.target.value as ProblemMeta["difficulty"] })}
        className="bg-transparent pl-4 text-on-surface outline-none"
        aria-label="Difficulty"
      >
        <option value="">Difficulty</option>
        <option value="Easy">Easy</option>
        <option value="Medium">Medium</option>
        <option value="Hard">Hard</option>
      </select>
    </div>
  );
}
