"use client";

import type { Sample } from "@/data/samples";

const DIFFICULTY_COLOR: Record<Sample["difficulty"], string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-error",
};

/**
 * Curated sample cards. Purely controlled — the parent decides visibility
 * (page-level "Try a sample" toggle) and receives the picked sample.
 */
export function SamplePicker({
  samples,
  onSelect,
}: {
  samples: Sample[];
  /** Called when the user picks a sample. The page fills the editor and meta. */
  onSelect: (sample: Sample) => void;
}) {
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-col gap-0.5">
        <span className="label-caps">Try a sample</span>
        <span className="text-body-sm text-on-surface-variant">
          Curated problems with tagged comments — one click to load and analyze.
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {samples.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="flex flex-col items-start gap-1 rounded border border-panel-border bg-surface-container-low p-3 text-left hover:border-primary"
            title={`Load and analyze ${s.name}`}
          >
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-body-sm font-semibold text-on-surface">{s.name}</span>
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
    </div>
  );
}
