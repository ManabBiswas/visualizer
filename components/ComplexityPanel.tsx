"use client";

import { useState } from "react";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { ConfidenceBadge } from "./ConfidenceBadge";

function normalizeBigO(raw: string): string {
  // Drop trailing commentary ("2^n (branching recursion) — ..." -> "2^n"),
  // unwrap O(...), normalize superscripts, ignore case and whitespace.
  let s = raw.trim().split(/\s+[(-]/)[0].toLowerCase();
  s = s.replace(/\u00B2/g, "^2").replace(/\u00B3/g, "^3");
  const wrapped = s.match(/^o\((.+)\)$/);
  if (wrapped) s = wrapped[1];
  return s.replace(/\s+/g, "");
}

export function ComplexityPanel({ result }: { result: ComplexityResult | null }) {
  const [revealed, setRevealed] = useState(false);
  const [guess, setGuess] = useState("");
  const [prevResult, setPrevResult] = useState(result);

  // Reset self-check state whenever a different method/result is shown
  // (render-phase state adjustment — React's recommended pattern for prop-driven resets).
  if (prevResult !== result) {
    setPrevResult(result);
    setRevealed(false);
    setGuess("");
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Analyze a method to see its complexity.
      </div>
    );
  }

  const guessTrimmed = guess.trim();
  const guessMatches =
    guessTrimmed.length > 0 && normalizeBigO(guessTrimmed) === normalizeBigO(result.time.bigO);

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
            onKeyDown={(e) => {
              if (e.key === "Enter") setRevealed(true);
            }}
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
          {guessTrimmed.length > 0 && (
            <div
              className={`rounded-md border p-3 text-body-sm ${
                guessMatches
                  ? "border-success/50 bg-success/10 text-success"
                  : "border-error/50 bg-error/10 text-error"
              }`}
            >
              {guessMatches
                ? `Correct — your guess ${guessTrimmed} matches the estimate.`
                : `Your guess: ${guessTrimmed} — the estimate below differs. Check the reasoning to see why.`}
            </div>
          )}
          <ComplexityRow label="Time" bigO={result.time.bigO} confidence={result.time.confidence} explanation={result.time.explanation} />
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
}: {
  label: string;
  bigO: string;
  confidence: ComplexityResult["time"]["confidence"];
  explanation: string;
}) {
  return (
    <div className="rounded-md border border-panel-border bg-surface-container p-3">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <p className="mt-1 font-mono text-code-lg text-text-high-contrast">{bigO}</p>
      <p className="mt-2 text-body-sm text-on-surface-variant">{explanation}</p>
    </div>
  );
}
