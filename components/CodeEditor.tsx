"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { OnMount } from "@monaco-editor/react";

// The Monaco editor instance type exposed to parents for cursor/line control.
export type CodeEditorHandle = Parameters<OnMount>[0];

// A system monospace stack, exactly like VS Code's default. System fonts are
// available synchronously, so Monaco measures glyph widths correctly on the
// first frame. Web fonts load asynchronously and make Monaco measure against a
// fallback then re-render — the cause of overlapping/garbled characters and a
// broken line-number gutter.
const MONO_STACK =
  "'Cascadia Code', Consolas, 'SF Mono', Menlo, 'DejaVu Sans Mono', 'Courier New', monospace";

// Load the Monaco React wrapper with SSR disabled. monaco-editor touches
// `window` on import, so it must never be evaluated during server prerender.
const MonacoReactEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.default), {
  ssr: false,
  loading: () => null,
});

type Props = {
  value: string;
  onChange: (value: string) => void;
  onMount?: (editor: CodeEditorHandle) => void;
  padding?: { top?: number; bottom?: number };
};

export function CodeEditor({ value, onChange, onMount, padding = { top: 12, bottom: 12 } }: Props) {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Point @monaco-editor/react at the locally bundled monaco (client-only),
      // then wait one frame so the container has real dimensions before mount.
      const [{ loader }, monaco] = await Promise.all([
        import("@monaco-editor/react"),
        import("monaco-editor"),
      ]);
      loader.config({ monaco });
      requestAnimationFrame(() => {
        if (!cancelled) setConfigured(true);
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMount: OnMount = (editor, monaco) => {
    editor.layout();
    monaco.editor.remeasureFonts();
    onMount?.(editor);
  };

  if (!configured) {
    return (
      <div className="flex h-full items-center justify-center text-body-sm text-text-muted">
        Loading editor…
      </div>
    );
  }

  return (
    <MonacoReactEditor
      language="java"
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        fontFamily: MONO_STACK,
        fontSize: 14,
        lineHeight: 21,
        fontLigatures: false,
        lineNumbers: "on",
        lineNumbersMinChars: 3,
        tabSize: 4,
        insertSpaces: true,
        wordWrap: "off",
        renderWhitespace: "selection",
        minimap: { enabled: false },
        glyphMargin: false,
        folding: true,
        padding,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        smoothScrolling: true,
        cursorBlinking: "smooth",
        cursorSmoothCaretAnimation: "on",
        mouseWheelZoom: true,
        guides: { indentation: true, bracketPairs: true },
        bracketPairColorization: { enabled: true },
        stickyScroll: { enabled: false },
        scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
      }}
    />
  );
}
