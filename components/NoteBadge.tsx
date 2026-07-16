import { CommentTag } from "@/lib/ir";

const STYLES: Record<CommentTag["tag"], string> = {
  q: "bg-primary-container/20 text-primary border-l-2 border-primary",
  note: "bg-note-badge/10 text-note-badge border-l-2 border-note-badge",
  why: "bg-why-badge/10 text-why-badge border-l-2 border-why-badge",
  complexity: "bg-complexity-badge/10 text-complexity-badge border-l-2 border-complexity-badge",
};

export function NoteCard({ tag, onJump }: { tag: CommentTag; onJump: (line: number) => void }) {
  return (
    <div className={`flex flex-col gap-1 rounded-md bg-surface-container-low p-3 ${STYLES[tag.tag]}`}>
      <span className="label-caps">{tag.tag}</span>
      <p className="text-body-sm text-on-surface">{tag.text}</p>
      <button
        onClick={() => onJump(tag.line)}
        className="self-end text-code-sm text-text-muted hover:text-primary"
      >
        jump to line {tag.line} →
      </button>
    </div>
  );
}
