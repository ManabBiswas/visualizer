"use client";

import { useRef, useState } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { MetadataBar, ProblemMeta } from "@/components/MetadataBar";
import { FlowchartPanel } from "@/components/FlowchartPanel";
import { ComplexityPanel } from "@/components/ComplexityPanel";
import { NoteCard } from "@/components/NoteBadge";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { CommentTag } from "@/lib/ir";

const EXAMPLE = `class Solution {
    // why: binary search halves the search space each iteration
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        // q: why use low + (high - low) / 2 instead of (low + high) / 2?
        while (low <= high) {
            int mid = low + (high - low) / 2;
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

type RightTab = "flowchart" | "complexity" | "notes";

export default function EditorPage() {
  const [code, setCode] = useState(EXAMPLE);
  const [meta, setMeta] = useState<ProblemMeta>({ name: "", link: "", topicTags: [], difficulty: "" });
  const [results, setResults] = useState<AnalyzeResult[]>([]);
  const [activeMethod, setActiveMethod] = useState(0);
  const [tab, setTab] = useState<RightTab>("flowchart");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

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
      setActiveMethod(0);
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
            {(["flowchart", "complexity", "notes"] as RightTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`border-b-2 px-4 py-2 text-body-sm capitalize ${
                  tab === t ? "border-primary text-on-surface" : "border-transparent text-text-muted"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === "flowchart" && (
              <FlowchartPanel diagram={current?.flowchart ?? null} onNodeHover={(line) => line && jumpToLine(line)} />
            )}
            {tab === "complexity" && <ComplexityPanel result={current?.complexity ?? null} />}
            {tab === "notes" && (
              <div className="flex h-full flex-col gap-2 overflow-auto p-panel-padding">
                {!current || current.method.comments.length === 0 ? (
                  <div className="text-body-sm text-text-muted">
                    No tagged comments yet. Use{" "}
                    <code className="font-mono text-code-sm text-primary">// q: your question</code>,{" "}
                    <code className="font-mono text-code-sm text-note-badge">// note: ...</code>,{" "}
                    <code className="font-mono text-code-sm text-why-badge">// why: ...</code>, or{" "}
                    <code className="font-mono text-code-sm text-complexity-badge">// complexity: ...</code>{" "}
                    in your code to build your revision notes.
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
