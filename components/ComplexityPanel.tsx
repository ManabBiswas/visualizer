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
  const [guessTime, setGuessTime] = useState("");
  const [guessSpace, setGuessSpace] = useState("");
  const [prevResult, setPrevResult] = useState(result);

  // Reset self-check state whenever a different method/result is shown
  // (render-phase state adjustment — React's recommended pattern for prop-driven resets).
  if (prevResult !== result) {
    setPrevResult(result);
    setRevealed(false);
    setGuessTime("");
    setGuessSpace("");
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Analyze a method to see its complexity.
      </div>
    );
  }

  const guessTimeTrimmed = guessTime.trim();
  const guessSpaceTrimmed = guessSpace.trim();
  const timeMatches =
    guessTimeTrimmed.length > 0 && normalizeBigO(guessTimeTrimmed) === normalizeBigO(result.time.bigO);
  const spaceMatches =
    guessSpaceTrimmed.length > 0 && normalizeBigO(guessSpaceTrimmed) === normalizeBigO(result.space.bigO);

  return (
    <div className="flex h-full flex-col gap-stack-gap overflow-auto p-panel-padding">
      {!revealed && (
        <div className="flex flex-col gap-2 rounded-md border border-panel-border bg-surface-container p-3">
          <span className="label-caps">Self-check</span>
          <p className="text-body-sm text-on-surface-variant">
            Before revealing, guess both complexities — this is the skill interviewers actually test.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
              Time
              <input
                value={guessTime}
                onChange={(e) => setGuessTime(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setRevealed(true);
                }}
                placeholder="e.g. O(n log n)"
                className="rounded bg-surface-container-lowest px-2 py-1 font-mono text-code-md text-on-surface outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-body-sm text-on-surface-variant">
              Space
              <input
                value={guessSpace}
                onChange={(e) => setGuessSpace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setRevealed(true);
                }}
                placeholder="e.g. O(1)"
                className="rounded bg-surface-container-lowest px-2 py-1 font-mono text-code-md text-on-surface outline-none focus-visible:ring-1 focus-visible:ring-primary"
              />
            </label>
          </div>
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
          <ComplexityRow
            label="Time"
            bigO={result.time.bigO}
            confidence={result.time.confidence}
            explanation={result.time.explanation}
            guess={guessTimeTrimmed || null}
            guessMatches={timeMatches}
          />
          <ComplexityRow
            label="Space"
            bigO={result.space.bigO}
            confidence={result.space.confidence}
            explanation={result.space.explanation}
            guess={guessSpaceTrimmed || null}
            guessMatches={spaceMatches}
          />
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
  guess,
  guessMatches,
}: {
  label: string;
  bigO: string;
  confidence: ComplexityResult["time"]["confidence"];
  explanation: string;
  guess: string | null;
  guessMatches: boolean;
}) {
  return (
    <div className="rounded-md border border-panel-border bg-surface-container p-3">
      <div className="flex items-center justify-between">
        <span className="label-caps">{label}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <p className="mt-1 font-mono text-code-lg text-text-high-contrast">{bigO}</p>
      {guess !== null && (
        <p
          className={`mt-1 text-body-sm ${
            guessMatches ? "text-success" : "text-error"
          }`}
        >
          {guessMatches
            ? `Correct — your guess ${guess} matches.`
            : `Your guess: ${guess} — differs from the estimate.`}
        </p>
      )}
      <p className="mt-2 text-body-sm text-on-surface-variant">{explanation}</p>
    </div>
  );
}
