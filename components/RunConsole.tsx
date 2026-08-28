"use client";

import { useState } from "react";

type RunResult = {
  ok: boolean;
  exitCode: number | null;
  stage: "compile" | "run";
  stdout: string;
  stderr: string;
  truncated: boolean;
  durationMs: number;
};

export function RunConsole({ code }: { code: string }) {
  const [stdin, setStdin] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: code, stdin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Run failed.");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const output = result
    ? [result.stdout, result.stderr].filter(Boolean).join("\n") || "(no output)"
    : "";

  return (
    <div className="flex h-52 shrink-0 flex-col border-t-2 border-panel-border bg-surface-container-lowest">
      <div className="flex shrink-0 items-center justify-between border-b border-panel-border px-3 py-1.5">
        <span className="label-caps">Console</span>
        <div className="flex items-center gap-2">
          {result && (
            <span
              className={`font-mono text-code-sm ${
                result.ok ? "text-complexity-badge" : "text-error"
              }`}
            >
              exit {result.exitCode ?? "?"} · {result.durationMs}ms
            </span>
          )}
          <button
            onClick={run}
            disabled={running}
            className="rounded bg-primary-container px-3 py-1 text-body-sm font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-50"
          >
            {running ? "Running…" : "Run"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-2/5 min-w-0 flex-col border-r border-panel-border">
          <div className="shrink-0 px-3 pt-1.5">
            <span className="text-code-sm text-text-muted">stdin (one value per line)</span>
          </div>
          <textarea
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void run();
              }
            }}
            spellCheck={false}
            placeholder={"5\n1 2 3 4 5"}
            className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-code-sm text-on-surface outline-none placeholder:text-text-muted/50"
          />
        </div>

        <div className="flex w-3/5 min-w-0 flex-col">
          <div className="shrink-0 px-3 pt-1.5">
            <span className="text-code-sm text-text-muted">output</span>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-code-sm">
            {error ? (
              <span className="text-error">{error}</span>
            ) : running ? (
              <span className="text-text-muted">compiling &amp; running…</span>
            ) : result ? (
              <span className={result.ok ? "text-on-surface" : "text-error"}>{output}</span>
            ) : (
              <span className="text-text-muted">
                Runs your program with a main() method. Input above is fed to Scanner /
                BufferedReader. Ctrl+Enter to run.
              </span>
            )}
          </pre>
        </div>
      </div>
    </div>
  );
}
