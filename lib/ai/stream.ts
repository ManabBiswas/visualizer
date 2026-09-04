// Server-side SSE consumption for OpenAI-compatible streaming responses.
//
// Mirrors the provider docs' canonical streaming client: accumulate
// delta.content chunks until [DONE]. Streaming keeps bytes flowing on slow
// free-tier models (which can queue for a minute before answering) so
// idle-connection timeouts never fire mid-generation.

import { coalesceContent } from "./extract";

export type StreamAccumulator = { text: string; done: boolean };

export function newAccumulator(): StreamAccumulator {
  return { text: "", done: false };
}

/**
 * Feeds one SSE event payload (the text after "data:") into the
 * accumulator. Malformed lines, keep-alives, and usage-only chunks are
 * skipped — exactly like the reference client, which only reads
 * chunk.choices[0].delta.content.
 */
export function feedSseEvent(acc: StreamAccumulator, payload: string): void {
  const trimmed = payload.trim();
  if (!trimmed) return;
  if (trimmed === "[DONE]") {
    acc.done = true;
    return;
  }
  let chunk: unknown;
  try {
    chunk = JSON.parse(trimmed);
  } catch {
    return; // keep-alive comment or junk line
  }
  const first = (chunk as { choices?: Array<{ delta?: { content?: unknown }; text?: unknown }> }).choices?.[0];
  if (!first) return; // usage-only chunk (stream_options include_usage)
  if (first.delta) {
    // delta.content is normally a string, but gateways that return typed
    // parts arrays in messages (tokenrouter) may do the same in deltas.
    const part = coalesceContent(first.delta.content);
    if (part) acc.text += part;
  } else if (typeof first.text === "string") {
    acc.text += first.text; // legacy completions dialect
  }
}

/** Normalizes SSE line endings (\r\n -> \n) across chunk boundaries. */
export function normalizeSse(buffer: string): string {
  return buffer.replace(/\r\n/g, "\n");
}

/**
 * Splits a normalized byte-stream buffer into complete SSE events.
 * Returns the extracted `data:` payloads plus the unconsumed tail (an
 * event that hasn't seen its blank-line terminator yet).
 */
export function splitSseBuffer(buffer: string): { events: string[]; rest: string } {
  const events: string[] = [];
  let rest = buffer;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) !== -1) {
    const rawEvent = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    for (const line of rawEvent.split("\n")) {
      if (line.startsWith("data:")) {
        // Optional single space after the colon, per the SSE spec.
        events.push(line.slice(5).replace(/^ /, ""));
      }
      // Non-data lines (event:, id:, retry:, comments) are ignored.
    }
  }
  return { events, rest };
}
