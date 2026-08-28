"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Editor, { OnMount } from "@monaco-editor/react";
import { MetadataBar, ProblemMeta } from "@/components/MetadataBar";
import { FlowchartPanel } from "@/components/FlowchartPanel";
import { CallGraphPanel } from "@/components/CallGraphPanel";
import { ComplexityPanel } from "@/components/ComplexityPanel";
import { NoteCard } from "@/components/NoteBadge";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { CommentTag } from "@/lib/ir";
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
  method: { name: string; comments: CommentTag[] };
  complexity: ComplexityResult;
  flowchart: string;
};

type RightTab = "flowchart" | "callgraph" | "complexity" | "notes";

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
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

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
    <div className="flex h-full flex-col">
      <MetadataBar meta={meta} onChange={setMeta} />

      <div className="flex flex-1 overflow-hidden">
        {/* Editor pane */}
        <div className="flex w-1/2 flex-col border-r border-panel-border">
          <div className="flex items-center justify-between border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
            <span className="label-caps">Java</span>
            <button
              onClick={analyze}
              disabled={loading}
              className="rounded bg-primary-container px-3 py-1 text-body-sm font-medium text-on-primary-container disabled:opacity-50"
            >
              {loading ? "Analyzing…" : "Analyze"}
            </button>
          </div>
          <div className="flex-1 bg-editor-bg">
            <Editor
              language="java"
              theme="vs-dark"
              value={code}
              onChange={(v) => setCode(v ?? "")}
              onMount={handleMount}
              options={{
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 13,
                minimap: { enabled: false },
                padding: { top: 12 },
              }}
            />
          </div>
          {error && (
            <div className="border-t border-error/40 bg-error-container/20 px-3 py-2 text-body-sm text-error">
              {error}
            </div>
          )}
        </div>

        {/* Analysis pane */}
        <div className="flex w-1/2 flex-col">
          {results.length > 1 && (
            <div className="flex gap-2 overflow-x-auto border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setActiveMethod(i)}
                  className={`whitespace-nowrap rounded px-2 py-0.5 font-mono text-code-sm ${
                    i === activeMethod ? "bg-primary-container text-on-primary-container" : "text-text-muted"
                  }`}
                >
                  {r.method.name}()
                </button>
              ))}
            </div>
          )}

          <div className="flex border-b border-panel-border">
            {((callGraph
              ? ["flowchart", "callgraph", "complexity", "notes"]
              : ["flowchart", "complexity", "notes"]) as RightTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-4 py-2 text-body-sm capitalize ${
                  tab === t ? "border-primary text-on-surface" : "border-transparent text-text-muted"
                }`}
              >
                {t === "callgraph" ? "Call Graph" : t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === "flowchart" && (
              <FlowchartPanel
                diagram={current?.flowchart ?? null}
                name={current?.method.name}
                onNodeHover={(line) => line && jumpToLine(line)}
              />
            )}
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
