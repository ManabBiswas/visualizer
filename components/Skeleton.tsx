"use client";

// Loading placeholders for the analysis pane while /api/analyze is in flight.
// Each variant mirrors the shape of the panel it stands in for, so the layout
// never jumps when real content replaces the skeleton.

export function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`skeleton h-3.5 w-full ${className}`} />;
}

const TABLE_ROW_WIDTHS = ["w-1/2", "w-2/3", "w-1/3", "w-3/5", "w-1/2", "w-2/5"];

export function AnalysisSkeleton({ variant }: { variant: "diagram" | "table" | "list" }) {
  if (variant === "diagram") {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3 p-panel-padding" aria-label="Analyzing…" role="status">
        <SkeletonLine className="w-2/3" />
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="skeleton h-3/5 w-4/5" />
        </div>
        <SkeletonLine className="w-1/3 self-end" />
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

  return (
    <div className="flex h-full flex-col gap-3 p-panel-padding" aria-label="Analyzing…" role="status">
      <SkeletonLine className="w-1/2" />
      <SkeletonLine className="w-3/4" />
      <SkeletonLine className="w-2/3" />
      <SkeletonLine className="w-1/3" />
    </div>
  );
}
