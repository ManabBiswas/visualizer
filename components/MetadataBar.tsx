"use client";

import { useState } from "react";
import { TOPICS } from "@/lib/topics";

export type ProblemMeta = {
  name: string;
  link: string;
  topicTags: string[];
  difficulty: "Easy" | "Medium" | "Hard" | "";
};

export function MetadataBar({ meta, onChange }: { meta: ProblemMeta; onChange: (m: ProblemMeta) => void }) {
  // Collapsed by default: metadata is optional, and the editor should own the
  // screen. Expanding reveals the save-to-log fields.
  const [open, setOpen] = useState(false);

  function addTopic(topic: string) {
    if (!topic || meta.topicTags.includes(topic)) return;
    onChange({ ...meta, topicTags: [...meta.topicTags, topic] });
  }

  function removeTopic(topic: string) {
    onChange({ ...meta, topicTags: meta.topicTags.filter((t) => t !== topic) });
  }

  const summary = [meta.name.trim(), meta.difficulty, meta.topicTags.join(", ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="shrink-0 border-b border-panel-border bg-surface-container-lowest">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-container-margin py-1.5 text-left text-body-sm hover:bg-surface-container"
        aria-expanded={open}
      >
        <span className="label-caps shrink-0">Problem details</span>
        {summary ? (
          <span className="truncate text-on-surface-variant">{summary}</span>
        ) : (
          <span className="truncate text-text-muted">
            optional — add a name, topics and difficulty to save this problem to your log and quiz deck
          </span>
        )}
        <span className="ml-auto shrink-0 text-text-muted">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-t border-panel-border px-container-margin py-2 text-body-sm">
          <label className="flex flex-col gap-1">
            <span className="label-caps">Problem name</span>
            <input
              value={meta.name}
              onChange={(e) => onChange({ ...meta, name: e.target.value })}
              placeholder="e.g. Two Sum"
              className="w-52 rounded border border-panel-border bg-surface-container px-2 py-1 text-on-surface outline-none placeholder:text-text-muted focus:border-primary"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="label-caps">Link (optional)</span>
            <input
              value={meta.link}
              onChange={(e) => onChange({ ...meta, link: e.target.value })}
              placeholder="https://leetcode.com/…"
              className="w-60 rounded border border-panel-border bg-surface-container px-2 py-1 text-on-surface outline-none placeholder:text-text-muted focus:border-primary"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="label-caps">Topics</span>
            <div className="flex min-h-[30px] flex-wrap items-center gap-1.5 rounded border border-panel-border bg-surface-container px-2 py-1">
              {meta.topicTags.map((t) => (
                <span key={t} className="badge bg-primary-container/15 text-primary" title={`Remove ${t}`}>
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
                className="bg-transparent text-text-muted outline-none hover:text-on-surface"
                aria-label="Add topic"
              >
                <option value="">+ Topic</option>
                {TOPICS.filter((t) => !meta.topicTags.includes(t)).map((t) => (
                  <option key={t} value={t} className="bg-surface-container text-on-surface">
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="label-caps">Difficulty</span>
            <select
              value={meta.difficulty}
              onChange={(e) => onChange({ ...meta, difficulty: e.target.value as ProblemMeta["difficulty"] })}
              className="rounded border border-panel-border bg-surface-container px-2 py-1 text-on-surface outline-none focus:border-primary"
              aria-label="Difficulty"
            >
              <option value="">—</option>
              <option value="Easy">Easy</option>
              <option value="Medium">Medium</option>
              <option value="Hard">Hard</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
