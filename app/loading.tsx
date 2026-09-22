import { SkeletonLine } from "@/components/Skeleton";

const LINE_WIDTHS = ["w-9/12", "w-7/12", "w-8/12", "w-6/12", "w-7/12", "w-5/12", "w-8/12", "w-6/12"];

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-panel-padding" aria-label="Loading…" role="status">
      <div className="flex items-center justify-between">
        <SkeletonLine className="w-40" />
        <div className="flex gap-2">
          <div className="skeleton h-9 w-28 rounded" />
          <div className="skeleton h-9 w-28 rounded" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex-1 rounded-lg border border-panel-border p-4">
          <SkeletonLine className="w-1/3 mb-4" />
          <div className="space-y-2.5">
            {LINE_WIDTHS.map((w, i) => (
              <SkeletonLine key={i} className={w} />
            ))}
          </div>
        </div>
        <div className="hidden flex-1 flex-col gap-3 md:flex">
          <div className="flex gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-8 w-24 rounded" />
            ))}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-panel-border">
            <div className="skeleton h-3/5 w-4/5 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
