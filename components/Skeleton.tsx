"use client";

// Loading placeholders for the analysis pane while /api/analyze is in flight.
// Each variant mirrors the shape of the panel it stands in for, so the layout
// never jumps when real content replaces the skeleton.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-3.5 w-full ${className}`} />;
}

const TABLE_ROW_WIDTHS = ["w-1/2", "w-2/3", "w-1/3", "w-3/5", "w-1/2", "w-2/5"];

export function AnalysisSkeleton({ variant }: { variant: "diagram" | "table" | "list" | "callgraph" | "complexity" | "notes" }) {
  if (variant === "diagram") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-panel-padding" aria-label="Analyzing…" role="status">
        <SkeletonLine className="w-2/3" />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="skeleton h-3/5 w-4/5 rounded-lg" />
        </div>
        <SkeletonLine className="w-1/3 self-end" />
      </div>
    );
  }

  if (variant === "callgraph") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-panel-padding" aria-label="Analyzing…" role="status">
        <div className="flex items-center gap-3">
          <SkeletonLine className="w-1/4" />
          <SkeletonLine className="w-1/6" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="skeleton h-3/5 w-4/5 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <SkeletonLine className="w-1/5" />
          <SkeletonLine className="w-1/6" />
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className="flex h-full flex-col gap-2.5 p-panel-padding" aria-label="Analyzing…" role="status">
        {TABLE_ROW_WIDTHS.map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonLine className="w-24 shrink-0" />
            <SkeletonLine className={w} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "complexity") {
    return (
      <div className="flex h-full flex-col gap-4 p-panel-padding" aria-label="Analyzing…" role="status">
        <div className="flex items-center gap-3">
          <SkeletonLine className="w-1/4" />
          <SkeletonLine className="w-1/6" />
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <SkeletonLine className="w-1/3 shrink-0" />
            <SkeletonLine className="w-1/4" />
          </div>
          <div className="space-y-1.5 pl-10">
            <SkeletonLine className="w-2/3" />
            <SkeletonLine className="w-1/2" />
          </div>
          <div className="flex items-center gap-4">
            <SkeletonLine className="w-1/3 shrink-0" />
            <SkeletonLine className="w-1/4" />
          </div>
          <div className="space-y-1.5 pl-10">
            <SkeletonLine className="w-2/3" />
            <SkeletonLine className="w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (variant === "notes") {
    return (
      <div className="flex h-full flex-col gap-4 p-panel-padding" aria-label="Analyzing…" role="status">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className="skeleton h-5 w-16 rounded" />
                <SkeletonLine className="w-1/4" />
              </div>
              <SkeletonLine className="w-2/3 ml-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-panel-padding" aria-label="Analyzing…" role="status">
      <SkeletonLine className="w-1/2" />
      <SkeletonLine className="w-3/4" />
      <SkeletonLine className="w-2/3" />
      <SkeletonLine className="w-1/3" />
    </div>
  );
}

/** Flashcard-shaped skeleton for the quiz page. */
export function QuizSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3" aria-label="Loading quiz…" role="status">
      <div className="flex items-center justify-between text-code-sm text-text-muted">
        <SkeletonLine className="w-40" />
        <SkeletonLine className="w-12" />
      </div>
      <div className="rounded-md border border-primary/40 bg-surface-container p-4">
        <SkeletonLine className="w-20 mb-2" />
        <SkeletonLine className="w-full" />
        <SkeletonLine className="w-3/4 mt-2" />
      </div>
      <div className="skeleton h-9 w-44 rounded" />
      <div className="flex gap-2 pt-2">
        <div className="skeleton h-8 w-24 rounded" />
        <div className="skeleton h-8 w-24 rounded" />
        <div className="skeleton h-8 w-24 rounded" />
      </div>
    </div>
  );
}

/** Dashboard-shaped skeleton for the progress page. */
export function ProgressSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-container-margin py-8" aria-label="Loading progress…" role="status">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SkeletonLine className="w-36 h-7" />
          <SkeletonLine className="w-72" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-32 rounded" />
          <div className="skeleton h-9 w-36 rounded" />
        </div>
      </header>

      {/* Totals strip */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="panel rounded-lg p-4">
            <SkeletonLine className="w-16 mb-2" />
            <SkeletonLine className="w-10 h-6" />
          </div>
        ))}
      </section>

      {/* Heatmap */}
      <section className="panel flex flex-col gap-3 rounded-lg p-5">
        <SkeletonLine className="w-32" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="skeleton h-5 w-5 rounded-sm" />
          ))}
        </div>
      </section>

      {/* Topic mastery */}
      <section className="panel flex flex-col gap-3 rounded-lg p-5">
        <SkeletonLine className="w-32" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <SkeletonLine className="w-24 shrink-0" />
            <div className="skeleton h-4 rounded" style={{ width: `${60 - i * 12}%` }} />
          </div>
        ))}
      </section>
    </div>
  );
}

/** Table-shaped skeleton for the problem log page. */
export function LogSkeleton() {
  const rowWidths = [
    ["w-1/4", "w-1/6", "w-16", "w-16", "w-16", "w-12", "w-16", "w-16"],
    ["w-1/3", "w-1/5", "w-16", "w-16", "w-16", "w-12", "w-16", "w-16"],
    ["w-1/4", "w-1/6", "w-16", "w-16", "w-16", "w-12", "w-16", "w-16"],
    ["w-5/12", "w-1/5", "w-16", "w-16", "w-16", "w-12", "w-16", "w-16"],
    ["w-1/3", "w-1/6", "w-16", "w-16", "w-16", "w-12", "w-16", "w-16"],
    ["w-2/5", "w-1/5", "w-16", "w-16", "w-16", "w-12", "w-16", "w-16"],
  ];
  return (
    <div className="flex flex-col gap-2" aria-label="Loading log…" role="status">
      <div className="flex items-center gap-4 border-b border-panel-border py-2">
        {["w-24", "w-24", "w-20", "w-16", "w-16", "w-16", "w-20", "w-16"].map((w, i) => (
          <SkeletonLine key={i} className={`${w} shrink-0`} />
        ))}
      </div>
      {rowWidths.map((cells, ri) => (
        <div key={ri} className="flex items-center gap-4 py-2.5">
          {cells.map((w, ci) => (
            <SkeletonLine key={ci} className={`${w} shrink-0`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Card-shaped skeleton for the interview session. */
export function InterviewSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6" aria-label="Loading interview…" role="status">
      <div className="flex items-center gap-2">
        <div className="skeleton h-6 w-28 rounded" />
        <div className="skeleton h-6 w-20 rounded" />
        <div className="ml-auto skeleton h-6 w-24 rounded" />
      </div>
      <div className="rounded-lg border border-panel-border bg-surface-container p-6">
        <SkeletonLine className="w-24 mb-4" />
        <SkeletonLine className="w-full mb-2" />
        <SkeletonLine className="w-4/5 mb-2" />
        <SkeletonLine className="w-3/5" />
      </div>
      <div className="flex gap-3">
        <div className="skeleton h-10 w-28 rounded" />
        <div className="skeleton h-10 w-28 rounded" />
        <div className="skeleton h-10 w-28 rounded" />
        <div className="skeleton h-10 w-28 rounded" />
      </div>
      <div className="flex justify-between">
        <div className="skeleton h-9 w-24 rounded" />
        <div className="skeleton h-9 w-24 rounded" />
      </div>
    </div>
  );
}
