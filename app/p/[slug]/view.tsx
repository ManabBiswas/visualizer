import Link from "next/link";


export type SharedProblem = {
  name: string;
  link: string | null;
  difficulty: string | null;
  topicTags: string[];
  sourceCode: string;
  createdAt: string;
};

export type MethodSummary = {
  name: string;
  timeBigO: string | null;
  spaceBigO: string | null;
  timeConfidence: string | null;
  spaceConfidence: string | null;
};

export type SharedNote = {
  tag: string;
  text: string;
  line: number | null;
};



const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-error",
};

const TAG_LABEL: Record<string, string> = {
  q: "Q",
  note: "Note",
  why: "Why",
  complexity: "Complexity",
};

const TAG_COLOR: Record<string, string> = {
  q: "bg-primary/10 text-primary",
  note: "bg-surface-container-high text-on-surface-variant",
  why: "bg-why-badge/10 text-why-badge",
  complexity: "bg-complexity-badge/10 text-complexity-badge",
};

export function SharedProblemView({
  problem,
  methods,
  notes,
}: {
  problem: SharedProblem;
  methods: MethodSummary[];
  notes: SharedNote[];
}) {
  return (
    <div data-scroll className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-container-margin py-10">
        <header className="flex flex-col gap-2">
          <span className="label-caps text-primary">Shared analysis</span>
          <h1 className="text-headline-lg text-text-high-contrast">
            {problem.name}
            {problem.difficulty && (
              <span className={`ml-3 align-middle text-body-md font-medium ${DIFFICULTY_COLOR[problem.difficulty]}`}>
                {problem.difficulty}
              </span>
            )}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {problem.topicTags.map((t) => (
              <span
                key={t}
                className="rounded bg-surface-container-high px-1.5 py-0.5 font-mono text-code-sm text-text-muted"
              >
                {t}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-body-sm text-text-muted">
            {problem.link && (
              <a
                href={problem.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Original problem ↗
              </a>
            )}
            <span>Shared via CodeLens</span>
          </div>
        </header>

        {methods.length > 0 && (
          <section className="flex flex-col gap-3">
            <span className="label-caps">Complexity</span>
            <div className="grid gap-3 sm:grid-cols-2">
              {methods.map((m) => (
                <div key={m.name} className="panel flex flex-col gap-1.5 rounded-lg p-4">
                  <span className="font-mono text-body-md font-semibold text-on-surface">{m.name}()</span>
                  <div className="flex items-baseline gap-2">
                    <span className="label-caps w-10">Time</span>
                    <span className="font-mono text-code-md text-primary">{m.timeBigO ?? "—"}</span>
                    {m.timeConfidence && (
                      <span className="text-code-sm text-text-muted">({m.timeConfidence} confidence)</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="label-caps w-10">Space</span>
                    <span className="font-mono text-code-md text-tertiary">{m.spaceBigO ?? "—"}</span>
                    {m.spaceConfidence && (
                      <span className="text-code-sm text-text-muted">({m.spaceConfidence} confidence)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <span className="label-caps">Solution</span>
          <div className="panel overflow-hidden rounded-lg">
            <div className="flex items-center gap-2 border-b border-panel-border bg-surface-container-lowest px-3 py-1.5">
              <span className="label-caps">Solution.java</span>
              <span className="font-mono text-code-sm text-text-muted">read-only</span>
            </div>
            <pre className="overflow-x-auto bg-editor-bg p-4 font-mono text-code-md leading-relaxed text-on-surface">
              {problem.sourceCode}
            </pre>
          </div>
        </section>

        {notes.length > 0 && (
          <section className="flex flex-col gap-3">
            <span className="label-caps">Revision notes</span>
            <div className="flex flex-col gap-2">
              {notes.map((n, i) => (
                <div key={i} className="flex items-start gap-2 rounded border border-panel-border bg-surface-container-low p-3">
                  <span className={`label-caps shrink-0 rounded px-1.5 py-0.5 ${TAG_COLOR[n.tag] ?? TAG_COLOR.note}`}>
                    {TAG_LABEL[n.tag] ?? n.tag}
                    {n.line != null && <span className="ml-1 opacity-70">L{n.line}</span>}
                  </span>
                  <p className="text-body-sm text-on-surface-variant">{n.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="flex flex-col items-center gap-2 border-t border-panel-border pt-6 text-center">
          <p className="text-body-sm text-text-muted">
            Analyzed with CodeLens — flowcharts, Big-O and spaced-repetition revision for Java DSA prep.
          </p>
          <Link
            href="/analyze"
            className="rounded bg-primary-container px-4 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
          >
            Analyze your own solution
          </Link>
        </footer>
      </div>
    </div>
  );
}
