"use client";

import { useState } from "react";
import Link from "next/link";
import type { Sample } from "@/data/samples";

const DIFFICULTY_COLOR: Record<Sample["difficulty"], string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-error",
};

export function SamplePicker({
  samples,
  onSelect,
  compact = false,
}: {
  samples: Sample[];
  /** Called when the user picks a sample. The page fills the editor and meta. */
  onSelect: (sample: Sample) => void;
  /** Compact card layout used in the editor toolbar (single row, small text). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  if (compact && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-panel-border px-3 py-1.5 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        title="Load a curated sample with rich comments"
      >
        Try a sample ▾
      </button>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1 rounded border border-panel-border bg-surface-container-lowest p-1">
        {samples.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              onSelect(s);
              setOpen(false);
            }}
            className="rounded px-2 py-1 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            title={s.blurb}
          >
            {s.name}
          </button>
        ))}
        <button
          onClick={() => setOpen(false)}
          className="ml-auto rounded px-2 py-1 text-body-sm text-text-muted hover:text-on-surface"
          title="Hide sample picker"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-panel-border bg-surface-container-low p-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="label-caps">Try a sample</span>
          <span className="text-body-sm text-on-surface-variant">
            Each one is tagged with comments — paste nothing, just click.
          </span>
        </div>
        {open && (
          <button
            onClick={() => setOpen(false)}
            className="text-body-sm text-text-muted hover:text-on-surface"
            aria-label="Hide sample picker"
          >
            ✕
          </button>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {samples.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="flex flex-col items-start gap-1 rounded border border-panel-border bg-surface-container-lowest p-3 text-left hover:border-primary hover:text-primary"
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-mono text-body-sm font-semibold">{s.name}</span>
              <span className={`label-caps ${DIFFICULTY_COLOR[s.difficulty]}`}>{s.difficulty}</span>
            </div>
            <p className="text-body-sm text-on-surface-variant">{s.blurb}</p>
            <div className="flex flex-wrap gap-1 pt-1">
              {s.topicTags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-code-sm text-text-muted"
                >
                  {t}
                </span>
              ))}
            </div>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1 text-code-sm text-text-muted">
        <span>Source: LeetCode.</span>
        <Link href="/analyze" className="text-primary hover:underline">
          Open editor →
        </Link>
      </div>
    </div>
  );
}
