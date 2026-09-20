"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { CodeEditor, type CodeEditorHandle } from "@/components/CodeEditor";
import { FlowchartPanel } from "@/components/FlowchartPanel";
import { ComplexityResult } from "@/lib/complexity/analyze";
import { diffComplexity, ComplexityDelta } from "@/lib/diff/compare";
import { MethodIR } from "@/lib/ir";
import { BlockComplexity } from "@/lib/complexity/blocks";

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

const BRUTE_EXAMPLE_PY = `def two_sum(nums, target):
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []
`;

const OPTIMIZED_EXAMPLE_PY = `def two_sum(nums, target):
    seen = {}  # value -> index
    for i, v in enumerate(nums):
        need = target - v
        if need in seen:
            return [seen[need], i]
        seen[v] = i
    return []
`;

const BRUTE_EXAMPLE_CPP = `#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        for (int i = 0; i < nums.size(); i++) {
            for (int j = i + 1; j < nums.size(); j++) {
                if (nums[i] + nums[j] == target) return {i, j};
            }
        }
        return {};
    }
};
`;

const OPTIMIZED_EXAMPLE_CPP = `#include <vector>
#include <unordered_map>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need)) return {seen[need], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
`;

const BRUTE_EXAMPLE_C = `#include <stdio.h>
#include <stdlib.h>

int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    for (int i = 0; i < numsSize; i++) {
        for (int j = i + 1; j < numsSize; j++) {
            if (nums[i] + nums[j] == target) {
                *returnSize = 2;
                int* result = malloc(2 * sizeof(int));
                result[0] = i;
                result[1] = j;
                return result;
            }
        }
    }
    *returnSize = 0;
    return NULL;
}
`;

const OPTIMIZED_EXAMPLE_C = `#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int key;
    int value;
} HashEntry;

int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    HashEntry* seen = calloc(numsSize, sizeof(HashEntry));
    int seenCount = 0;
    
    for (int i = 0; i < numsSize; i++) {
        int need = target - nums[i];
        for (int j = 0; j < seenCount; j++) {
            if (seen[j].key == need) {
                *returnSize = 2;
                int* result = malloc(2 * sizeof(int));
                result[0] = seen[j].value;
                result[1] = i;
                free(seen);
                return result;
            }
        }
        seen[seenCount++] = (HashEntry){nums[i], i};
    }
    *returnSize = 0;
    free(seen);
    return NULL;
}
`;

type Language = "java" | "python" | "cpp" | "c";

type SideResult = {
  method: MethodIR;
  complexity: ComplexityResult;
  blockComplexity: BlockComplexity[];
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

async function analyzeSource(source: string, language: Language): Promise<SideResult[]> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, language }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Analysis failed.");
  return data.results as SideResult[];
}

export default function DiffPage() {
  const [language, setLanguage] = useState<Language>("java");
  const [brute, setBrute] = useState(BRUTE_EXAMPLE);
  const [optimized, setOptimized] = useState(OPTIMIZED_EXAMPLE);
  const [bruteResult, setBruteResult] = useState<SideResult | null>(null);
  const [optimizedResult, setOptimizedResult] = useState<SideResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const bruteEditor = useRef<CodeEditorHandle | null>(null);
  const optimizedEditor = useRef<CodeEditorHandle | null>(null);

  function jump(ref: MutableRefObject<CodeEditorHandle | null>, line: number | null) {
    if (!line) return;
    ref.current?.revealLineInCenter(line);
    ref.current?.setPosition({ lineNumber: line, column: 1 });
    ref.current?.focus();
  }

  async function downloadReport() {
    const target = optimizedResult || bruteResult;
    if (!target) return;
    setReporting(true);
    try {
      const { downloadPdfReport } = await import("@/lib/export/report");
      await downloadPdfReport({
        title: `Diff Report — ${target.method.name} (${language})`,
        code: optimized || brute,
        method: target.method,
        complexity: target.complexity,
        blockComplexity: target.blockComplexity ?? [],
      });
    } catch (e) {
      setError(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setReporting(false);
    }
  }

  async function analyzeBoth() {
    setLoading(true);
    setError(null);
    try {
      const [a, b] = await Promise.all([analyzeSource(brute, language), analyzeSource(optimized, language)]);
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

  function switchLanguage(l: Language) {
    if (language === l) return;
    setLanguage(l);
    if (l === "python") {
      setBrute(BRUTE_EXAMPLE_PY);
      setOptimized(OPTIMIZED_EXAMPLE_PY);
    } else if (l === "cpp") {
      setBrute(BRUTE_EXAMPLE_CPP);
      setOptimized(OPTIMIZED_EXAMPLE_CPP);
    } else if (l === "c") {
      setBrute(BRUTE_EXAMPLE_C);
      setOptimized(OPTIMIZED_EXAMPLE_C);
    } else {
      setBrute(BRUTE_EXAMPLE);
      setOptimized(OPTIMIZED_EXAMPLE);
    }
    setBruteResult(null);
    setOptimizedResult(null);
    setError(null);
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
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-panel-border" role="group" aria-label="Source language">
            {(["java", "python", "cpp", "c"] as Language[]).map((l) => (
              <button
                key={l}
                onClick={() => switchLanguage(l)}
                className={`px-2.5 py-1 font-mono text-code-sm ${
                  language === l
                    ? "bg-primary-container text-on-primary-container"
                    : "text-text-muted hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={downloadReport}
            disabled={reporting || (!bruteResult && !optimizedResult)}
            className="rounded border border-panel-border bg-surface-container-high px-3 py-1.5 text-body-sm font-medium text-on-surface hover:bg-surface-container disabled:opacity-50"
          >
            {reporting ? "Generating…" : "PDF Report"}
          </button>
          <button
            onClick={analyzeBoth}
            disabled={loading}
            className="rounded bg-primary-container px-4 py-1.5 text-body-sm font-medium text-on-primary-container disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze Both"}
          </button>
        </div>
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
          <div className="h-64 overflow-hidden bg-editor-bg">
            <CodeEditor
              value={brute}
              onChange={setBrute}
              language={language === "python" ? "python" : language === "cpp" ? "cpp" : language === "c" ? "cpp" : "java"}
              padding={{ top: 8, bottom: 8 }}
              onMount={(editor) => {
                bruteEditor.current = editor;
              }}
            />
          </div>
        </div>
        <div className="flex flex-col border-b border-panel-border">
          <span className="label-caps border-b border-panel-border bg-surface-container-lowest px-3 py-1.5 text-success">
            Optimized
          </span>
          <div className="h-64 overflow-hidden bg-editor-bg">
            <CodeEditor
              value={optimized}
              onChange={setOptimized}
              language={language === "python" ? "python" : language === "cpp" ? "cpp" : language === "c" ? "cpp" : "java"}
              padding={{ top: 8, bottom: 8 }}
              onMount={(editor) => {
                optimizedEditor.current = editor;
              }}
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
                method={bruteResult.method}
                label={`brute: ${bruteResult.method.name}()`}
                onNodeHover={(line) => jump(bruteEditor, line)}
              />
            </div>
            <div className="h-[32rem]">
              <FlowchartPanel
                method={optimizedResult.method}
                label={`optimized: ${optimizedResult.method.name}()`}
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
