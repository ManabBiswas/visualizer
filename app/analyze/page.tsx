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
import { NoteMaker } from "@/components/NoteMaker";
import { SamplePicker } from "@/components/SamplePicker";
import { AiQuizDrawer } from "@/components/AiQuizDrawer";
import { AnalysisSkeleton } from "@/components/Skeleton";
import { Button } from "@/components/Button";
import { SAMPLES, findSample, type Sample } from "@/data/samples";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { BlockComplexity } from "@/lib/complexity/blocks";
import { CommentTag, MethodIR } from "@/lib/ir";
import { isValidId } from "@/lib/security/validate";
import { toast } from "@/components/Toast";

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

const EXAMPLE_PY = `def search(arr, target):
    # why: binary search halves the search space each iteration
    low, high = 0, len(arr) - 1
    # q: why is a hash lookup O(1) here but the whole loop O(log n)?
    while low <= high:
        mid = low + (high - low) // 2  # note: mid belongs to the current range
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            low = mid + 1
        else:
            high = mid - 1
    return -1
`;

const EXAMPLE_CPP = `// why: binary search halves the search space each iteration
// complexity: time O(log n), space O(1)
#include <vector>
using namespace std;

int search(vector<int>& arr, int target) {
    int low = 0, high = arr.size() - 1;
    // q: why use low + (high - low) / 2 instead of (low + high) / 2?
    while (low <= high) {
        int mid = low + (high - low) / 2;
        // note: mid belongs to the current search range
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}
`;

type Language = "java" | "python" | "cpp";

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
  const sampleId = searchParams.get("sample");

  const [code, setCode] = useState(EXAMPLE);
  const [language, setLanguage] = useState<Language>("java");
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
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  // Source line the editor cursor is parked on. Drives the "pulsing node"
  // highlight on the flowchart (the bidirectional code↔diagram link).
  const [activeLine, setActiveLine] = useState<number | null>(null);
  // Sample picker visibility. Opens by default on a fresh visit (cold start),
  // stays closed when deep-linking (?sample=) or editing a saved problem.
  const [sampleOpen, setSampleOpen] = useState(true);
  // BYO-key AI quiz-drafting drawer (Notes tab). Only meaningful for saved
  // problems — the endpoint loads the problem + IR owner-scoped.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [splitRatio, setSplitRatio] = useState<"50" | "60" | "40" | "70" | "30">("50");
  const editorRef = useRef<CodeEditorHandle | null>(null);

  // Clear a stale save warning when navigating to a different problem
  // (render-phase state adjustment — React's recommended pattern).
  const [prevProblemId, setPrevProblemId] = useState(problemId);
  if (prevProblemId !== problemId) {
    setPrevProblemId(problemId);
    setSaveWarning(null);
  }

  // Deep link: /analyze?sample=two-sum loads a curated sample and analyzes
  // it immediately — the marketing-site "Try a sample" CTA target. Deferred
  // via a macrotask so the state updates happen outside the effect's
  // synchronous path (React compiler-friendly).
  const appliedSampleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!sampleId || appliedSampleRef.current === sampleId) return;
    appliedSampleRef.current = sampleId;
    const t = setTimeout(() => {
      const sample = findSample(sampleId);
      if (sample) loadSample(sample);
      else setError(`Unknown sample: ${sampleId}`);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sampleId]);

  useEffect(() => {
    if (!problemId || !isValidId(problemId)) return;
    fetch(`/api/problems/${encodeURIComponent(problemId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Problem not found."))))
      .then((d) => {
        setCode(d.problem.sourceCode);
        if (d.problem.language === "python") setLanguage("python");
        else if (d.problem.language === "cpp") setLanguage("cpp");
        else setLanguage("java");
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

  // Takes meta explicitly: loadSample() calls this in the same tick as
  // setMeta(), so reading the `meta` state here would see the PREVIOUS
  // problem's meta and upsert the sample under the old name — destroying the
  // old problem's analyses/notes (the server upserts by name).
  // Same for language: languageOverride flows from loadSample.
  async function analyze(source: string = code, metaOverride?: ProblemMeta, languageOverride?: Language) {
    const effectiveMeta = metaOverride ?? meta;
    const effectiveLanguage = languageOverride ?? language;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source,
          language: effectiveLanguage,
          problem: effectiveMeta.name ? effectiveMeta : undefined,
        }),
      });
      let data: {
        results?: AnalyzeResult[];
        callGraph?: string | null;
        callGraphLight?: string | null;
        callGraphTooltips?: Record<string, string> | null;
        savedProblemId?: string | null;
        saveWarning?: string | null;
        error?: string;
      };
      try {
        data = await res.json();
      } catch {
        throw new Error(`Analysis failed (HTTP ${res.status}).`);
      }
      if (!res.ok) throw new Error(data.error ?? `Analysis failed (HTTP ${res.status}).`);
      if (!Array.isArray(data.results)) {
        throw new Error("Analysis failed: the server returned an unexpected response.");
      }
      setResults(data.results);
      setCallGraph(data.callGraph ?? null);
      setCallGraphLight(data.callGraphLight ?? null);
      setCallGraphTooltips(data.callGraphTooltips ?? null);
      setActiveMethod(0);
      setSavedProblemId(data.savedProblemId ?? null);
      setSaveWarning(data.saveWarning ?? null);
      if (data.savedProblemId) toast.success(`Saved to log: ${effectiveMeta.name}`);
    } catch (e) {
      setError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  /** Load one of the curated samples: fill editor + meta, then analyze it. */
  function loadSample(sample: Sample) {
    const sampleMeta: ProblemMeta = {
      name: sample.name,
      link: sample.link,
      topicTags: [...sample.topicTags],
      difficulty: sample.difficulty,
    };
    const sampleLanguage: Language = sample.language === "python" ? "python" : sample.language === "cpp" ? "cpp" : "java";
    setCode(sample.source);
    setLanguage(sampleLanguage);
    setMeta(sampleMeta);
    setResults([]);
    setCallGraph(null);
    setCallGraphLight(null);
    setCallGraphTooltips(null);
    setSavedProblemId(null);
    setSaveWarning(null);
    setError(null);
    setSampleOpen(false);
    void analyze(sample.source, sampleMeta, sampleLanguage);
  }

  const current = results[activeMethod];

  async function downloadReport() {
    if (!current) return;
    setReporting(true);
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
      toast.error(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setReporting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MetadataBar meta={meta} onChange={setMeta} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Editor pane */}
        <div className={`flex h-full min-w-0 flex-col border-r border-panel-border ${
          splitRatio === "30" ? "w-[30%]"
          : splitRatio === "40" ? "w-[40%]"
          : splitRatio === "50" ? "w-1/2"
          : splitRatio === "60" ? "w-[60%]"
          : "w-[70%]"
        }`}>
<div className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-container-lowest px-3 py-1.5 flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="label-caps">Editor</span>
              <span className="font-mono text-code-sm text-text-muted">
                {language === "python" ? "solution.py" : language === "cpp" ? "solution.cpp" : "Solution.java"}
              </span>
              <div className="ml-2 flex overflow-hidden rounded border border-panel-border flex-wrap" role="group" aria-label="Source language">
                {(["java", "python", "cpp"] as Language[]).map((l) => (
                  <Button
                    key={l}
                    variant={language === l ? "primary" : "outline"}
                    size="sm"
                    onClick={() => {
                      if (language === l) return;
                      setLanguage(l);
                      setCode(l === "python" ? EXAMPLE_PY : l === "cpp" ? EXAMPLE_CPP : EXAMPLE);
                      setResults([]);
                      setCallGraph(null);
                      setCallGraphLight(null);
                      setCallGraphTooltips(null);
                      setSavedProblemId(null);
                      setSaveWarning(null);
                      setError(null);
                    }}
                    title={l === "python" ? "Switch to Python analysis" : l === "cpp" ? "Switch to C++ analysis" : "Switch to Java analysis"}
                  >
                    {l}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant={sampleOpen ? "primary" : "outline"}
                size="sm"
                onClick={() => setSampleOpen((o) => !o)}
                title="Curated samples with rich tagged comments — one click to analyze"
              >
                {sampleOpen ? "Samples ▾" : "Try a sample ▸"}
              </Button>
              {RUN_ENABLED && (language === "java" || language === "cpp") && (
                <Button
                  variant={consoleOpen ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setConsoleOpen((o) => !o)}
                  title="Toggle the run console (execute your code with stdin input)"
                >
                  {consoleOpen ? "Console ▾" : "Console ▸"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={downloadReport}
                disabled={!current || reporting}
                title="Download a light-theme PDF report: code, complexity, blocks, notes and flowchart"
                loading={reporting}
              >
                PDF Report
              </Button>
              <div className="flex items-center gap-1 ml-2">
                <span className="text-body-sm text-text-muted hidden sm:inline">Split:</span>
                <select
                  value={splitRatio}
                  onChange={(e) => setSplitRatio(e.target.value as "50" | "60" | "40" | "70" | "30")}
                  className="rounded border border-panel-border bg-surface-container-high px-2 py-1 text-body-sm text-on-surface focus-visible:ring-1 focus-visible:ring-primary"
                  aria-label="Editor/Analysis pane split ratio"
                >
                  <option value="30">30/70</option>
                  <option value="40">40/60</option>
                  <option value="50">50/50</option>
                  <option value="60">60/40</option>
                  <option value="70">70/30</option>
                </select>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void analyze()}
                disabled={loading}
                loading={loading}
              >
                Analyze
              </Button>
            </div>
          </div>
          {sampleOpen && (
            <div className="shrink-0 border-b border-panel-border bg-surface-container-lowest">
              <SamplePicker samples={SAMPLES} onSelect={loadSample} />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden bg-editor-bg">
            <CodeEditor
              value={code}
              onChange={setCode}
              language={language === "python" ? "python" : language === "cpp" ? "cpp" : "java"}
              onMount={(editor) => {
                editorRef.current = editor;
              }}
              onCursorChange={setActiveLine}
            />
          </div>
          {consoleOpen && RUN_ENABLED && (language === "java" || language === "cpp") && <RunConsole code={code} language={language} />}
          {saveWarning && (
            <div className="flex shrink-0 items-center gap-3 border-t border-warning/40 bg-warning/10 px-3 py-2 text-body-sm text-on-surface-variant">
              <span className="min-w-0 flex-1">{saveWarning}</span>
              {saveWarning.includes("Sign in") && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => signIn("github", { callbackUrl: "/analyze" })}
                >
                  Sign in with GitHub
                </Button>
              )}
            </div>
          )}
          {error && (
            <div className="shrink-0 border-t border-error/40 bg-error-container/20 px-3 py-2 text-body-sm text-error">
              {error}
            </div>
          )}
        </div>

        {/* Analysis pane */}
        <div className="flex h-full flex-1 min-w-0 flex-col">
          {results.length > 1 && (
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
              <span className="label-caps shrink-0">Methods</span>
              {results.map((r, i) => (
                <Button
                  key={i}
                  variant={i === activeMethod ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setActiveMethod(i)}
                >
                  {r.method.name}()
                </Button>
              ))}
            </div>
          )}

          <div className="flex shrink-0 border-b border-panel-border bg-surface-container-lowest flex-wrap overflow-x-auto pb-1 gap-1 px-2">
            {((callGraph
              ? ["flowchart", "blocks", "callgraph", "complexity", "notes"]
              : ["flowchart", "blocks", "complexity", "notes"]) as RightTab[]).map((t) => (
              <Button
                key={t}
                variant={tab === t ? "primary" : "ghost"}
                size="sm"
                onClick={() => setTab(t)}
                className="h-auto py-2 px-4 whitespace-nowrap shrink-0"
              >
                {TAB_LABELS[t]}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {loading ? (
              <AnalysisSkeleton
                variant={
                tab === "flowchart"
                  ? "diagram"
                  : tab === "callgraph"
                  ? "callgraph"
                  : tab === "blocks"
                  ? "table"
                  : tab === "complexity"
                  ? "complexity"
                  : tab === "notes"
                  ? "notes"
                  : "list"
              }
              />
            ) : (
              <>
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
                    {savedProblemId && (
                      <NoteMaker
                        problemId={savedProblemId}
                        problemName={meta.name || "this problem"}
                        onNoteAdded={() => void analyze()}
                      />
                    )}
                    {savedProblemId && current && current.method.comments.some((c) => c.tag === "q") && (
                      <Link
                        href={`/quiz?problem=${savedProblemId}`}
                    className="self-start rounded bg-surface-container-high px-3 py-1 text-body-sm text-on-surface hover:text-primary"
                  >
                    Quiz these notes
                  </Link>
                )}
                {savedProblemId && (
                  <div className="flex flex-col gap-2">
                    <Button
                      variant={aiOpen ? "primary" : "outline"}
                      size="sm"
                      onClick={() => {
                        setAiOpen((o) => !o);
                        setAiNotice(null);
                      }}
                      title="Optional: draft quiz cards with your own AI provider key — drafts are reviewed before they enter the deck"
                    >
                      {aiOpen ? "Close AI drafting" : "Draft quiz cards with AI…"}
                    </Button>
                    {aiOpen && (
                      <AiQuizDrawer
                        problemId={savedProblemId}
                        problemName={meta.name || "this problem"}
                        onClose={() => setAiOpen(false)}
                        onAccepted={(n) =>
                          setAiNotice(
                            n === 1
                              ? "Card added to this problem's deck."
                              : `${n} cards added to this problem's deck.`,
                          )
                        }
                      />
                    )}
                    {aiNotice && (
                      <span className="text-body-sm text-success">{aiNotice}</span>
                    )}
                  </div>
                )}
                {!current || current.method.comments.length === 0 ? (
                  <div className="text-body-sm text-text-muted">
                    No tagged comments yet. Use{" "}
                    <code className="font-mono text-code-sm text-primary">{"// q: your question"}</code>,{" "}
                    <code className="font-mono text-code-sm text-note-badge">{"// note: ..."}</code>,{" "}
                    <code className="font-mono text-code-sm text-why-badge">{"// why: ..."}</code>, or{" "}
                    <code className="font-mono text-code-sm text-complexity-badge">{"// complexity: ..."}</code>{" "}
                    (same in C++; or with <code className="font-mono text-code-sm">{"#"}</code> in Python) to build
                    your revision notes. They also appear inside the flowchart.
                  </div>
                ) : (
                  current.method.comments.map((tagItem, i) => (
                    <NoteCard key={i} tag={tagItem} onJump={jumpToLine} />
                  ))
                )}
              </div>
                )}
              </>
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
