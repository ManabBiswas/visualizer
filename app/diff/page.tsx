"use client";

import { useRef, useState, type MutableRefObject } from "react";
import Editor, { OnMount } from "@monaco-editor/react";
import { FlowchartPanel } from "@/components/FlowchartPanel";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { diffComplexity, ComplexityDelta } from "@/lib/diff/compare";
import { CommentTag } from "@/lib/ir";

const BRUTE_EXAMPLE = `class Solution {
    int[] twoSum(int[] nums, int target) {
        for (int i = 0; i < nums.length; i++) {
            for (int j = i + 1; j < nums.length; j++) {
                if (nums[i] + nums[j] == target) return new int[]{ i, j };
            }
        }
        return new int[]{};
    }
}
`;

const OPTIMIZED_EXAMPLE = `class Solution {
    int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need)) return new int[]{ seen.get(need), i };
            seen.put(nums[i], i);
        }
        return new int[]{};
    }
}
`;

type SideResult = {
  method: { name: string; comments: CommentTag[] };
  complexity: ComplexityResult;
  flowchart: string;
};

const VERDICT_STYLE: Record<ComplexityDelta["time"]["verdict"], string> = {
  improved: "border-success/50 bg-success/10 text-success",
  regressed: "border-error/50 bg-error/10 text-error",
  unclear: "border-panel-border bg-surface-container text-text-muted",
};

const VERDICT_LABEL: Record<ComplexityDelta["time"]["verdict"], string> = {
  improved: "improved",
  regressed: "regressed",
  unclear: "unclear",
};

async function analyzeSource(source: string): Promise<SideResult[]> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
  return data.results as SideResult[];
}

export default function DiffPage() {
  const [brute, setBrute] = useState(BRUTE_EXAMPLE);
  const [optimized, setOptimized] = useState(OPTIMIZED_EXAMPLE);
  const [bruteResult, setBruteResult] = useState<SideResult | null>(null);
  const [optimizedResult, setOptimizedResult] = useState<SideResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bruteEditor = useRef<Parameters<OnMount>[0] | null>(null);
  const optimizedEditor = useRef<Parameters<OnMount>[0] | null>(null);

  function jump(ref: MutableRefObject<Parameters<OnMount>[0] | null>, line: number | null) {
    if (!line) return;
    ref.current?.revealLineInCenter(line);
    ref.current?.setPosition({ lineNumber: line, column: 1 });
    ref.current?.focus();
  }

  async function analyzeBoth() {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([analyzeSource(brute), analyzeSource(optimized)]);
      setBruteResult(a[0] ?? null);
      setOptimizedResult(b[0] ?? null);
      if (!a[0] || !b[0]) setError("Both solutions must contain at least one method.");
    } catch (e) {
      setError((e as Error).message);
      setBruteResult(null);
      setOptimizedResult(null);
    } finally {
      setLoading(false);
    }
  }

  const delta =
    bruteResult && optimizedResult
      ? diffComplexity(bruteResult.complexity, optimizedResult.complexity)
      : null;

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-panel-border bg-surface-container-lowest px-container-margin py-2">
        <div>
          <h1 className="text-headline-md text-text-high-contrast">Diff — Brute Force vs Optimized</h1>
          <p className="text-body-sm text-text-muted">
            Paste both attempts at the same problem and narrate the complexity improvement — the classic interview moment.
          </p>
        </div>
        <button
          onClick={analyzeBoth}
          disabled={loading}
          className="rounded bg-primary-container px-4 py-1.5 text-body-sm font-medium text-on-primary-container disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Analyze Both"}
        </button>
      </div>

      {error && (
        <div className="border-b border-error/40 bg-error-container/20 px-container-margin py-2 text-body-sm text-error">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="flex flex-col border-b border-panel-border lg:border-r">
          <span className="label-caps border-b border-panel-border bg-surface-container-lowest px-3 py-1.5 text-error">
            Brute Force
          </span>
          <div className="h-64 bg-editor-bg">
            <Editor
              language="java"
              theme="vs-dark"
              value={brute}
              onChange={(v) => setBrute(v ?? "")}
              onMount={(e) => (bruteEditor.current = e)}
              options={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, minimap: { enabled: false }, padding: { top: 8 } }}
            />
          </div>
        </div>
        <div className="flex flex-col border-b border-panel-border">
          <span className="label-caps border-b border-panel-border bg-surface-container-lowest px-3 py-1.5 text-success">
            Optimized
          </span>
          <div className="h-64 bg-editor-bg">
            <Editor
              language="java"
              theme="vs-dark"
              value={optimized}
              onChange={(v) => setOptimized(v ?? "")}
              onMount={(e) => (optimizedEditor.current = e)}
              options={{ fontFamily: "JetBrains Mono, monospace", fontSize: 13, minimap: { enabled: false }, padding: { top: 8 } }}
            />
          </div>
        </div>
      </div>

      {delta && bruteResult && optimizedResult && (
        <>
          <div className="grid grid-cols-1 gap-3 border-b border-panel-border p-container-margin lg:grid-cols-2">
            <div className={`rounded-md border p-3 ${VERDICT_STYLE[delta.time.verdict]}`}>
              <span className="label-caps">Time</span>
              <p className="mt-1 font-mono text-code-lg">
                {delta.time.before} {"\u2192"} {delta.time.after}
                <span className="ml-2 text-body-sm">({VERDICT_LABEL[delta.time.verdict]})</span>
              </p>
            </div>
            <div className={`rounded-md border p-3 ${VERDICT_STYLE[delta.space.verdict]}`}>
              <span className="label-caps">Space</span>
              <p className="mt-1 font-mono text-code-lg">
                {delta.space.before} {"\u2192"} {delta.space.after}
                <span className="ml-2 text-body-sm">({VERDICT_LABEL[delta.space.verdict]})</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 p-container-padding text-body-sm text-on-surface-variant lg:grid-cols-2">
            <div>
              <span className="label-caps">Why (brute force)</span>
              <p className="mt-1">{bruteResult.complexity.time.explanation}</p>
            </div>
            <div>
              <span className="label-caps">Why (optimized)</span>
              <p className="mt-1">{optimizedResult.complexity.time.explanation}</p>
            </div>
          </div>

          <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
            <div className="h-[32rem] border-panel-border lg:border-r">
              <FlowchartPanel
                diagram={bruteResult.flowchart}
                name={`brute: ${bruteResult.method.name}()`}
                onNodeHover={(line) => jump(bruteEditor, line)}
              />
            </div>
            <div className="h-[32rem]">
              <FlowchartPanel
                diagram={optimizedResult.flowchart}
                name={`optimized: ${optimizedResult.method.name}()`}
                onNodeHover={(line) => jump(optimizedEditor, line)}
                showLegend={false}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
