"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { CodeEditor, type CodeEditorHandle } from "@/components/CodeEditor";
import { MetadataBar, ProblemMeta } from "@/components/MetadataBar";
import { FlowchartPanel } from "@/components/FlowchartPanel";
import { CallGraphPanel } from "@/components/CallGraphPanel";
import { WalkthroughPanel } from "@/components/WalkthroughPanel";
import { RunConsole } from "@/components/RunConsole";
import { ComplexityPanel } from "@/components/ComplexityPanel";
import { NoteCard } from "@/components/NoteBadge";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { BlockComplexity } from "@/lib/complexity/blocks";
import { CommentTag, MethodIR } from "@/lib/ir";
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
  method: MethodIR;
  complexity: ComplexityResult;
  blockComplexity: BlockComplexity[];
};

type RightTab = "flowchart" | "blocks" | "callgraph" | "complexity" | "notes";

const TAB_LABELS: Record<RightTab, string> = {
  flowchart: "Flowchart",
  blocks: "Blocks",
  callgraph: "Call Graph",
  complexity: "Complexity",
  notes: "Notes",
};

// Code execution is opt-in per deployment (it shells out to a local JVM,
// which isn't available on serverless hosts). Not a secret — safe to inline.
const RUN_ENABLED = process.env.NEXT_PUBLIC_ENABLE_RUN === "1";

function EditorPage() {
  const searchParams = useSearchParams();
  const problemId = searchParams.get("problem");

  const [code, setCode] = useState(EXAMPLE);
  const [meta, setMeta] = useState<ProblemMeta>({ name: "", link: "", topicTags: [], difficulty: "" });
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const [callGraph, setCallGraph] = useState<string | null>(null);
  const [callGraphLight, setCallGraphLight] = useState<string | null>(null);
  // nodeId -> tooltip text, returned by the server. Re-injected as SVG
  // <title> elements by CallGraphPanel after rendering.
  const [callGraphTooltips, setCallGraphTooltips] = useState<Record<string, string> | null>(null);
  const [activeMethod, setActiveMethod] = useState(0);
  const [tab, setTab] = useState<RightTab>("flowchart");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProblemId, setSavedProblemId] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  // Source line the editor cursor is parked on. Drives the "pulsing node"
  // highlight on the flowchart (the bidirectional code↔diagram link).
  const [activeLine, setActiveLine] = useState<number | null>(null);
  const editorRef = useRef<CodeEditorHandle | null>(null);

  // Clear a stale save warning when navigating to a different problem
  // (render-phase state adjustment — React's recommended pattern).
  const [prevProblemId, setPrevProblemId] = useState(problemId);
  if (prevProblemId !== problemId) {
    setPrevProblemId(problemId);
    setSaveWarning(null);
  }

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
    setActiveLine(line);
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
      setCallGraphLight(data.callGraphLight ?? null);
      setCallGraphTooltips(data.callGraphTooltips ?? null);
      setActiveMethod(0);
      setSavedProblemId(data.savedProblemId ?? null);
      setSaveWarning(data.saveWarning ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const current = results[activeMethod];

  async function downloadReport() {
    if (!current) return;
    setReporting(true);
    setReportError(null);
    try {
      // Lazy-load the report generator so jspdf/mermaid stay out of the
      // initial bundle and are only fetched when a report is requested.
      const { downloadPdfReport } = await import("@/lib/export/report");
      await downloadPdfReport({
        title: meta.name || `${current.method.name} — complexity report`,
        difficulty: meta.difficulty || undefined,
        topicTags: meta.topicTags,
        link: meta.link || undefined,
        code,
        method: current.method,
        complexity: current.complexity,
        blockComplexity: current.blockComplexity,
      });
    } catch (e) {
      setReportError(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setReporting(false);
    }
  }

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
              {RUN_ENABLED && (
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
              )}
              <button
                onClick={downloadReport}
                disabled={!current || reporting}
                className="rounded border border-panel-border px-3 py-1.5 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40"
                title="Download a light-theme PDF report: code, complexity, blocks, notes and flowchart"
              >
                {reporting ? "Building…" : "PDF Report"}
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
              onCursorChange={setActiveLine}
            />
          </div>
          {consoleOpen && RUN_ENABLED && <RunConsole code={code} />}
          {saveWarning && (
            <div className="flex shrink-0 items-center gap-3 border-t border-warning/40 bg-warning/10 px-3 py-2 text-body-sm text-on-surface-variant">
              <span className="min-w-0 flex-1">{saveWarning}</span>
              {saveWarning.includes("Sign in") && (
                <button
                  onClick={() => signIn("github", { callbackUrl: "/analyze" })}
                  className="shrink-0 rounded bg-primary-container px-3 py-1 text-body-sm font-medium text-on-primary-container hover:opacity-90"
                >
                  Sign in with GitHub
                </button>
              )}
            </div>
          )}
          {(error || reportError) && (
            <div className="shrink-0 border-t border-error/40 bg-error-container/20 px-3 py-2 text-body-sm text-error">
              {error ?? reportError}
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
                method={current?.method ?? null}
                onNodeHover={(line) => line && jumpToLine(line)}
                activeLine={activeLine}
              />
            )}
            {tab === "blocks" && (
              <WalkthroughPanel
                body={current?.method.body}
                onJump={jumpToLine}
                blockComplexity={current?.blockComplexity}
              />
            )}
            {tab === "callgraph" && callGraph && (
              <CallGraphPanel
                diagram={callGraph}
                diagramLight={callGraphLight}
                tooltips={callGraphTooltips}
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
