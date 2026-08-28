"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CodeEditor, type CodeEditorHandle } from "@/components/CodeEditor";
import { MetadataBar, ProblemMeta } from "@/components/MetadataBar";
import { FlowchartPanel } from "@/components/FlowchartPanel";
import { CallGraphPanel } from "@/components/CallGraphPanel";
import { WalkthroughPanel } from "@/components/WalkthroughPanel";
import { RunConsole } from "@/components/RunConsole";
import { ComplexityPanel } from "@/components/ComplexityPanel";
import { NoteCard } from "@/components/NoteBadge";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { CommentTag, StatementNode } from "@/lib/ir";
import { isValidId } from "@/lib/security/validate";

const EXAMPLE = `class Solution {
    // why: binary search halves the search space each iteration
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        // q: why use low + (high - low) / 2 instead of (low + high) / 2?
        while (low <= high) {
            int mid = low + (high - low) / 2; // note: mid belongs to the current search range
            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return -1;
    }
}
`;

type AnalyzeResult = {
  className: string;
  method: { name: string; comments: CommentTag[]; body: StatementNode[] };
  complexity: ComplexityResult;
  flowchart: string;
};

type RightTab = "flowchart" | "blocks" | "callgraph" | "complexity" | "notes";

const TAB_LABELS: Record<RightTab, string> = {
  flowchart: "Flowchart",
  blocks: "Blocks",
  callgraph: "Call Graph",
  complexity: "Complexity",
  notes: "Notes",
};

function EditorPage() {
  const searchParams = useSearchParams();
  const problemId = searchParams.get("problem");

  const [code, setCode] = useState(EXAMPLE);
  const [meta, setMeta] = useState<ProblemMeta>({ name: "", link: "", topicTags: [], difficulty: "" });
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const [callGraph, setCallGraph] = useState<string | null>(null);
  const [activeMethod, setActiveMethod] = useState(0);
  const [tab, setTab] = useState<RightTab>("flowchart");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProblemId, setSavedProblemId] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const editorRef = useRef<CodeEditorHandle | null>(null);

  useEffect(() => {
    if (!problemId || !isValidId(problemId)) return;
    fetch(`/api/problems/${encodeURIComponent(problemId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Problem not found."))))
      .then((d) => {
        setCode(d.problem.sourceCode);
        setMeta({
          name: d.problem.name,
          link: d.problem.link ?? "",
          topicTags: d.problem.topicTags ?? [],
          difficulty: d.problem.difficulty ?? "",
        });
        setSavedProblemId(d.problem.id);
      })
      .catch((e) => setError((e as Error).message));
  }, [problemId]);

  function jumpToLine(line: number) {
    editorRef.current?.revealLineInCenter(line);
    editorRef.current?.setPosition({ lineNumber: line, column: 1 });
    editorRef.current?.focus();
  }

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: code,
          problem: meta.name ? meta : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
      setResults(data.results);
      setCallGraph(data.callGraph ?? null);
      setActiveMethod(0);
      setSavedProblemId(data.savedProblemId ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const current = results[activeMethod];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MetadataBar meta={meta} onChange={setMeta} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Editor pane */}
        <div className="flex h-full w-1/2 min-w-0 flex-col border-r border-panel-border">
          <div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="label-caps">Editor</span>
              <span className="font-mono text-code-sm text-text-muted">Solution.java</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConsoleOpen((o) => !o)}
                className={`rounded border px-3 py-1.5 text-body-sm font-medium ${
                  consoleOpen
                    ? "border-primary text-primary"
                    : "border-panel-border text-on-surface-variant hover:text-on-surface"
                }`}
                title="Toggle the run console (execute your code with stdin input)"
              >
                {consoleOpen ? "Console ▾" : "Console ▸"}
              </button>
              <button
                onClick={analyze}
                disabled={loading}
                className="rounded bg-primary-container px-4 py-1.5 text-body-sm font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "Analyzing…" : "Analyze"}
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-editor-bg">
            <CodeEditor
              value={code}
              onChange={setCode}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
            />
          </div>
          {consoleOpen && <RunConsole code={code} />}
          {error && (
            <div className="shrink-0 border-t border-error/40 bg-error-container/20 px-3 py-2 text-body-sm text-error">
              {error}
            </div>
          )}
        </div>

        {/* Analysis pane */}
        <div className="flex h-full w-1/2 min-w-0 flex-col">
          {results.length > 1 && (
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
              <span className="label-caps shrink-0">Methods</span>
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMethod(i)}
                  className={`whitespace-nowrap rounded px-2 py-0.5 font-mono text-code-sm ${
                    i === activeMethod
                      ? "bg-primary-container text-on-primary-container"
                      : "text-text-muted hover:bg-surface-container-high hover:text-on-surface"
                  }`}
                >
                  {r.method.name}()
                </button>
              ))}
            </div>
          )}

          <div className="flex shrink-0 border-b border-panel-border bg-surface-container-lowest">
            {((callGraph
              ? ["flowchart", "blocks", "callgraph", "complexity", "notes"]
              : ["flowchart", "blocks", "complexity", "notes"]) as RightTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-4 py-2 text-body-sm font-medium ${
                  tab === t
                    ? "border-primary bg-surface-container text-primary"
                    : "border-transparent text-text-muted hover:text-on-surface"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {tab === "flowchart" && (
              <FlowchartPanel
                diagram={current?.flowchart ?? null}
                name={current?.method.name}
                onNodeHover={(line) => line && jumpToLine(line)}
              />
            )}
            {tab === "blocks" && <WalkthroughPanel body={current?.method.body} onJump={jumpToLine} />}
            {tab === "callgraph" && callGraph && (
              <CallGraphPanel
                diagram={callGraph}
                name={meta.name || "problem"}
                onMethodClick={(methodName) => {
                  const idx = results.findIndex((r) => r.method.name === methodName);
                  if (idx >= 0) {
                    setActiveMethod(idx);
                    setTab("flowchart");
                  }
                }}
              />
            )}
            {tab === "complexity" && <ComplexityPanel result={current?.complexity ?? null} />}
            {tab === "notes" && (
              <div className="flex h-full flex-col gap-2 overflow-auto p-panel-padding">
                {savedProblemId && current && current.method.comments.some((c) => c.tag === "q") && (
                  <Link
                    href={`/quiz?problem=${savedProblemId}`}
                    className="self-start rounded bg-surface-container-high px-3 py-1 text-body-sm text-on-surface hover:text-primary"
                  >
                    Quiz these notes
                  </Link>
                )}
                {!current || current.method.comments.length === 0 ? (
                  <div className="text-body-sm text-text-muted">
                    No tagged comments yet. Use{" "}
                    <code className="font-mono text-code-sm text-primary">{"// q: your question"}</code>,{" "}
                    <code className="font-mono text-code-sm text-note-badge">{"// note: ..."}</code>,{" "}
                    <code className="font-mono text-code-sm text-why-badge">{"// why: ..."}</code>, or{" "}
                    <code className="font-mono text-code-sm text-complexity-badge">{"// complexity: ..."}</code>{" "}
                    in your code to build your revision notes. They also appear inside the flowchart.
                  </div>
                ) : (
                  current.method.comments.map((tagItem, i) => (
                    <NoteCard key={i} tag={tagItem} onJump={jumpToLine} />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditorPageWithSuspense() {
  return (
    <Suspense fallback={<div className="p-panel-padding text-body-sm text-text-muted">Loading editor…</div>}>
      <EditorPage />
    </Suspense>
  );
}
