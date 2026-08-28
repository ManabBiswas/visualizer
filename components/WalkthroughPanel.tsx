"use client";

import { useMemo } from "react";
import { StatementNode } from "@/lib/ir";
import { buildWalkthrough, WalkEntry } from "@/lib/walkthrough/flatten";
import { BlockComplexity } from "@/lib/complexity/blocks";

const KIND_STYLE: Record<string, { border: string; badge: string; label: string }> = {
  loop: { border: "border-l-[#d2a8ff]", badge: "bg-[#d2a8ff]/15 text-[#d2a8ff]", label: "LOOP" },
  if: { border: "border-l-[#79c0ff]", badge: "bg-[#79c0ff]/15 text-[#79c0ff]", label: "IF" },
  switch: { border: "border-l-[#e3b341]", badge: "bg-[#e3b341]/15 text-[#e3b341]", label: "SWITCH" },
  try: { border: "border-l-[#ffa657]", badge: "bg-[#ffa657]/15 text-[#ffa657]", label: "TRY" },
  call: { border: "border-l-[#56d4dd]", badge: "bg-[#56d4dd]/15 text-[#56d4dd]", label: "CALL" },
  return: { border: "border-l-[#57ab5a]", badge: "bg-[#57ab5a]/15 text-[#57ab5a]", label: "RETURN" },
  statement: { border: "border-l-outline-variant", badge: "bg-surface-container-high text-text-muted", label: "CODE" },
};

const BOUND_HINT: Record<string, string> = {
  constant: "fixed number of iterations",
  parameter: "bounded by a parameter",
  "input-dependent": "scales with the input size",
  unknown: "bound unclear",
};

function nodeText(node: StatementNode): string {
  switch (node.type) {
    case "loop": {
      if (node.kind === "do-while") return `do … while (${node.condition ?? ""})`;
      const cond = node.condition ? ` (${node.condition})` : "";
      return `${node.kind}${cond}`;
    }
    case "if":
      return `if (${node.branches[0]?.condition ?? ""})`;
    case "switch":
      return "switch (…)";
    case "try":
      return "try { … }";
    case "call":
      return `${node.target}(${node.args ?? ""})`;
    case "return":
      return node.value ? `return ${node.value}` : "return";
    case "statement":
      return node.text;
  }
}

function nodeLine(node: StatementNode): number {
  return node.line;
}

export function WalkthroughPanel({
  body,
  onJump,
  blockComplexity,
}: {
  body: StatementNode[] | undefined;
  onJump: (line: number) => void;
  blockComplexity?: BlockComplexity[];
}) {
  const complexityByLine = useMemo(() => {
    const map = new Map<number, BlockComplexity>();
    for (const b of blockComplexity ?? []) map.set(b.line, b);
    return map;
  }, [blockComplexity]);

  if (!body || body.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Analyze a method to see its block walkthrough.
      </div>
    );
  }

  const entries = buildWalkthrough(body);

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-auto p-panel-padding">
      <p className="mb-1 text-body-sm text-text-muted">
        The method as readable blocks — one card per statement, nested bodies indented. Loops and calls show their own
        time/space cost. Click a line number to jump to the code.
      </p>
      {entries.map((entry, i) => (
        <Entry key={i} entry={entry} onJump={onJump} complexity={complexityByLine} />
      ))}
    </div>
  );
}

function Entry({
  entry,
  onJump,
  complexity,
}: {
  entry: WalkEntry;
  onJump: (line: number) => void;
  complexity: Map<number, BlockComplexity>;
}) {
  if (entry.kind === "divider") {
    return (
      <div className="mt-1 flex items-center gap-2" style={{ marginLeft: entry.depth * 22 + 10 }}>
        <span className="font-mono text-code-sm font-semibold text-tertiary">{entry.label}</span>
        <span className="h-px flex-1 bg-panel-border" />
      </div>
    );
  }

  const node = entry.node;
  const style = KIND_STYLE[node.type] ?? KIND_STYLE.statement;
  const line = nodeLine(node);

  return (
    <div
      className={`rounded-r-md border border-l-4 border-panel-border bg-surface-container px-3 py-2 ${style.border}`}
      style={{ marginLeft: entry.depth * 22 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`badge ${style.badge}`}>{style.label}</span>
        {node.type === "loop" && (
          <span className="badge bg-surface-container-high text-on-surface-variant" title={BOUND_HINT[node.boundType]}>
            {node.boundType}
          </span>
        )}
        {node.type === "call" && node.isRecursive && (
          <span className="badge bg-error/15 text-error">RECURSIVE</span>
        )}
        <button
          onClick={() => onJump(line)}
          className="ml-auto rounded bg-surface-container-lowest px-1.5 py-0.5 font-mono text-code-sm text-text-muted hover:text-primary"
          title={`Jump to line ${line}`}
        >
          L{line}
        </button>
      </div>
      <p className="mt-1 break-words font-mono text-code-md text-text-high-contrast">{nodeText(node)}</p>
      {node.type === "loop" && (
        <p className="mt-0.5 text-body-sm text-text-muted">{BOUND_HINT[node.boundType]}</p>
      )}
      {(node.type === "loop" || node.type === "call") && complexity.get(line) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-panel-border pt-1.5">
          <span className="badge bg-complexity-badge/15 text-complexity-badge" title="Time complexity of this block">
            ⏱ {complexity.get(line)!.time}
          </span>
          <span className="badge bg-note-badge/15 text-note-badge" title="Space complexity of this block">
            💾 {complexity.get(line)!.space}
          </span>
          <span className="basis-full text-body-sm text-text-muted">{complexity.get(line)!.note}</span>
        </div>
      )}
    </div>
  );
}
