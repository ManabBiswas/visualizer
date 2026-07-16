"use client";

import { useState } from "react";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { ConfidenceBadge } from "./ConfidenceBadge";

export function ComplexityPanel({ result }: { result: ComplexityResult | null }) {
  const [revealed, setRevealed] = useState(false);
  const [guess, setGuess] = useState("");

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Analyze a method to see its complexity.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-stack-gap overflow-auto p-panel-padding">
      {!revealed && (
        <div className="flex flex-col gap-2 rounded-md border border-panel-border bg-surface-container p-3">
          <span className="label-caps">Self-check</span>
          <p className="text-body-sm text-on-surface-variant">
            Before revealing, guess the time complexity — this is the skill interviewers actually test.
          </p>
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            placeholder="e.g. O(n log n)"
            className="rounded bg-surface-container-lowest px-2 py-1 font-mono text-code-md text-on-surface outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          <button
            onClick={() => setRevealed(true)}
            className="self-start rounded bg-primary-container px-3 py-1 text-body-sm font-medium text-on-primary-container"
          >
            Reveal answer
          </button>
        </div>
      )}

      {revealed && (
        <>
          <ComplexityRow label="Time" bigO={result.time.bigO} confidence={result.time.confidence} explanation={result.time.explanation} yourGuess={guess} />
          <ComplexityRow label="Space" bigO={result.space.bigO} confidence={result.space.confidence} explanation={result.space.explanation} />
        </>
      )}
    </div>
  );
}

function ComplexityRow({
  label,
  bigO,
  confidence,
  explanation,
  yourGuess,
}: {
  label: string;
  bigO: string;
  confidence: ComplexityResult["time"]["confidence"];
  explanation: string;
  yourGuess?: string;
}) {
  return (
    <div className="rounded-md border border-panel-border bg-surface-container p-3">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <p className="mt-1 font-mono text-code-lg text-text-high-contrast">{bigO}</p>
      {yourGuess && (
        <p className="mt-1 text-body-sm text-text-muted">
          Your guess: <span className="font-mono text-code-sm">{yourGuess || "(blank)"}</span>
        </p>
      )}
      <p className="mt-2 text-body-sm text-on-surface-variant">{explanation}</p>
    </div>
  );
}
