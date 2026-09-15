"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "@/components/Toast";

type NoteType = "q" | "note" | "why" | "complexity";

const NOTE_LABELS: Record<NoteType, string> = {
  q: "Question",
  note: "Note",
  why: "Why",
  complexity: "Complexity",
};

const NOTE_PLACEHOLDERS: Record<NoteType, string> = {
  q: "What is the loop invariant here?",
  note: "This variable tracks the current maximum...",
  why: "We use binary search because...",
  complexity: "Time O(log n), Space O(1)",
};

interface NoteMakerProps {
  problemId: string;
  problemName: string;
  onNoteAdded: () => void;
}

export function NoteMaker({ problemId, problemName, onNoteAdded }: NoteMakerProps) {
  const [activeType, setActiveType] = useState<NoteType>("q");
  const [text, setText] = useState("");
  const [lineNumber, setLineNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId,
          tagType: activeType,
          text: trimmed,
          lineNumber: lineNumber ? parseInt(lineNumber, 10) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save note");

      setText("");
      setLineNumber("");
      onNoteAdded();
      toast.success(`Added ${NOTE_LABELS[activeType].toLowerCase()} to ${problemName}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-surface-container-lowest p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="label-caps text-primary">Add note / question</span>
        <div className="flex gap-1" role="group" aria-label="Note type">
          {(["q", "note", "why", "complexity"] as NoteType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveType(t)}
              className={`px-2.5 py-1 text-code-sm rounded ${
                activeType === t
                  ? "bg-primary-container text-on-primary-container"
                  : "text-text-muted hover:bg-surface-container-high hover:text-on-surface"
              }`}
            >
              {NOTE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={NOTE_PLACEHOLDERS[activeType]}
          rows={3}
          className="resize-y rounded border border-panel-border bg-surface-container px-2 py-1.5 text-body-sm text-on-surface outline-none focus:border-primary"
          aria-label={`${NOTE_LABELS[activeType]} text`}
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <input
              type="number"
              min={1}
              max={10000}
              value={lineNumber}
              onChange={(e) => setLineNumber(e.target.value)}
              placeholder="Line (optional)"
              className="w-24 rounded border border-panel-border bg-surface-container px-1.5 py-0.5 text-code-sm text-on-surface outline-none focus:border-primary"
              aria-label="Source line number"
            />
            <span className="text-code-sm text-text-muted">Optional — links to editor line</span>
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setText("");
            setLineNumber("");
          }}
          className="rounded border border-panel-border px-3 py-1.5 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="rounded bg-primary-container px-4 py-1.5 text-body-sm font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-40"
        >
          {saving ? "Saving…" : `Add ${NOTE_LABELS[activeType]}`}
        </button>
      </div>
    </form>
  );
}