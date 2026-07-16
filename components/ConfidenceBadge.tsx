import { Confidence } from "@/lib/complexity/analyze";

const DOT_COLOR: Record<Confidence, string> = {
  High: "bg-success",
  Medium: "bg-warning",
  Low: "bg-error",
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className="badge bg-surface-container-high text-on-surface-variant">
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_COLOR[confidence]}`} />
      {confidence} confidence
    </span>
  );
}
