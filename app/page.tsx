import Link from "next/link";
import pkg from "../package.json";
import { BackToTop } from "@/components/BackToTop";

const FEATURES = [
  {
    title: "Flowcharts",
    body: "Every method becomes an interactive flowchart. Hover a node to jump straight to that line in the editor.",
    accent: "text-primary",
  },
  {
    title: "Complexity analysis",
    body: "Time and space Big-O with confidence scores, plus a per-block breakdown of loops, recursion and conditionals.",
    accent: "text-complexity-badge",
  },
  {
    title: "Call graphs",
    body: "Multi-method solutions get a class-level call graph so you can see how helpers feed into the main approach.",
    accent: "text-why-badge",
  },
  {
    title: "Notes that quiz you",
    body: "Tag comments with // q:, // note:, // why: and they become spaced-repetition flashcards automatically.",
    accent: "text-note-badge",
  },
  {
    title: "Run console",
    body: "Execute your Java right in the browser tab with custom stdin — verify the edge case before you move on.",
    accent: "text-success",
  },
  {
    title: "PDF reports",
    body: "Export a clean light-theme report with code, complexity, blocks and flowchart for offline revision.",
    accent: "text-tertiary",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Paste your solution",
    body: "Drop in any Java solution — from LeetCode, a contest, or your own practice set. Add the problem name and tags if you want it logged.",
  },
  {
    step: "02",
    title: "Analyze",
    body: "CodeLens parses the code, builds the flowchart and call graph, and derives Big-O for every method and block.",
  },
  {
    step: "03",
    title: "Revise later",
    body: "Everything lands in your log. Quiz cards surface from your // q: comments and schedule themselves by recall.",
  },
];

const SAMPLE = `class Solution {
    // why: binary search halves the search space each iteration
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        // q: why use low + (high - low) / 2?
        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) low = mid + 1;
            else high = mid - 1;
        }
        return -1;
    }
}`;

export default function LandingPage() {
  return (
    <div data-scroll className="h-full overflow-y-auto">
      <BackToTop />
      <div className="mx-auto flex w-full max-w-5xl flex-col px-container-margin pb-16">
        <section className="flex flex-col items-start gap-5 pb-14 pt-16">
          <span className="label-caps rounded-full border border-panel-border bg-surface-container-low px-3 py-1">
            Java · DSA · Placement prep
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight text-text-high-contrast">
            Understand your solutions{" "}
            <span className="text-primary">before the interviewer asks.</span>
          </h1>
          <p className="max-w-xl text-body-md text-on-surface-variant">
            CodeLens turns Java solutions into flowcharts, call graphs and Big-O
            analysis — then converts your own comments into a spaced-repetition
            quiz so the reasoning actually sticks.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href="/analyze"
              className="rounded bg-primary-container px-5 py-2.5 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
            >
              Open the Editor
            </Link>
            <Link
              href="/log"
              className="rounded border border-panel-border px-5 py-2.5 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            >
              Browse the Log
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-14 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel flex flex-col gap-2 rounded-lg p-5">
              <span className={`label-caps ${f.accent}`}>{f.title}</span>
              <p className="text-body-sm leading-relaxed text-on-surface-variant">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="grid items-start gap-6 pb-14 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <h2 className="text-headline-lg text-text-high-contrast">How it works</h2>
            {STEPS.map((s) => (
              <div key={s.step} className="flex gap-4">
                <span className="badge shrink-0 bg-surface-container-high text-primary">{s.step}</span>
                <div className="flex flex-col gap-1">
                  <span className="text-body-md font-semibold text-on-surface">{s.title}</span>
                  <p className="text-body-sm text-on-surface-variant">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="panel overflow-hidden rounded-lg">
            <div className="flex items-center gap-2 border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
              <span className="label-caps">Solution.java</span>
              <span className="font-mono text-code-sm text-text-muted">tagged comments become notes</span>
            </div>
            <pre className="overflow-x-auto bg-editor-bg p-4 font-mono text-code-md leading-relaxed text-on-surface">
              {SAMPLE}
            </pre>
          </div>
        </section>

        <section className="panel flex flex-col items-start justify-between gap-4 rounded-lg p-6 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-1">
            <span className="text-body-md font-semibold text-on-surface">Already solved something today?</span>
            <span className="text-body-sm text-on-surface-variant">
              Paste it in, get the breakdown, and let the quiz handle the rest.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/quiz"
              className="rounded border border-panel-border px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            >
              Quiz
            </Link>
            <Link
              href="/diff"
              className="rounded border border-panel-border px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            >
              Diff
            </Link>
            <Link
              href="/analyze"
              className="rounded bg-primary-container px-4 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
            >
              Analyze
            </Link>
          </div>
        </section>
      </div>

      <footer className="border-t border-panel-border bg-surface-container-lowest">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-container-margin py-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-code-md font-semibold text-text-high-contrast">CodeLens</span>
            <p className="max-w-xs text-body-sm text-text-muted">
              Flowcharts, Big-O and spaced-repetition revision for your Java DSA prep.
            </p>
          </div>
          <div className="flex gap-12">
            <div className="flex flex-col gap-2">
              <span className="label-caps">Workspace</span>
              <Link href="/analyze" className="text-body-sm text-on-surface-variant hover:text-primary">
                Editor
              </Link>
              <Link href="/diff" className="text-body-sm text-on-surface-variant hover:text-primary">
                Diff
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="label-caps">Revision</span>
              <Link href="/log" className="text-body-sm text-on-surface-variant hover:text-primary">
                Log
              </Link>
              <Link href="/quiz" className="text-body-sm text-on-surface-variant hover:text-primary">
                Quiz
              </Link>
            </div>
          </div>
        </div>
        <div className="">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-container-margin py-3">
            <span className="font-mono text-code-sm text-text-muted">
              Java parsing · Mermaid diagrams · Monaco editor
            </span>
            <span className="font-mono text-code-sm text-text-muted">v{pkg.version}</span>
          </div>
        </div>
        <div className="border-t border-panel-border py-4">
          <div className="mx-auto flex w-full max-w-5xl flex-row items-center justify-evenly gap-1 px-container-margin">
            <span className="text-center font-mono text-code-sm text-text-muted">
              © {new Date().getFullYear()} Manab. All rights reserved.
            </span>
            <a
              href="https://github.com/ManabBiswas"
              target="_blank"
              rel="noopener noreferrer"
              className="text-center font-mono text-code-sm text-primary hover:underline"
            >
              GitHub profile for collaboration
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
