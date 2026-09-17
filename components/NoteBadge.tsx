"use client";

import { CommentTag } from "@/lib/ir";
import { Button } from "./Button";

const STYLES: Record<CommentTag["tag"], string> = {
  q: "bg-primary-container/20 text-primary border-l-2 border-primary",
  note: "bg-note-badge/10 text-note-badge border-l-2 border-note-badge",
  why: "bg-why-badge/10 text-why-badge border-l-2 border-why-badge",
  complexity: "bg-complexity-badge/10 text-complexity-badge border-l-2 border-complexity-badge",
};

export function NoteCard({ tag, onJump }: { tag: CommentTag; onJump: (line: number) => void }) {
  return (
    <div className={`flex flex-col gap-2 rounded-md bg-surface-container-low p-3 ${STYLES[tag.tag]} transition-shadow hover:shadow-md`}>
      <span className="label-caps">{tag.tag}</span>
      <p className="text-body-sm text-on-surface">{tag.text}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onJump(tag.line)}
        className="self-end"
      >
        jump to line {tag.line} →
      </Button>
    </div>
  );
}
