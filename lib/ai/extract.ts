// Response-text extraction for the AI drafting providers.
//
// Each provider (and, for "custom", every OpenAI-compatible gateway) wraps
// the model's text differently — and some gateways return content as an
// array of typed parts instead of a plain string. This module normalizes
// all of it. Pure, so every dialect is pinned by unit tests.

export type ExtractProvider = "openai" | "gemini" | "anthropic" | "custom";

/**
 * Coalesces an OpenAI-style message content that may be a plain string OR
 * an array of typed parts ([{type:"text", text:"…"}, …]) — several
 * OpenAI-compatible gateways (tokenrouter, some Ollama builds) return the
 * array form. Returns null when no text survives.
 */
export function coalesceContent(content: unknown): string | null {
  if (typeof content === "string") return content.length > 0 ? content : null;
  if (Array.isArray(content)) {
    const text = content
      .map((part) =>
        typeof part === "object" && part !== null && (part as { type?: string }).type === "text"
          ? (part as { text?: unknown }).text
          : null,
      )
      .filter((t): t is string => typeof t === "string")
      .join("");
    return text.length > 0 ? text : null;
  }
  return null;
}

/**
 * Pulls the model's text out of a provider response. Returns null when the
 * payload doesn't match any known dialect.
 */
export function extractModelText(provider: ExtractProvider, data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;

  if (provider === "openai" || provider === "custom") {
    const choices = d.choices as Array<{ message?: { content?: unknown }; text?: unknown }> | undefined;
    const first = choices?.[0];
    if (!first) return null;
    // Standard string content first, then the typed-parts array form.
    if (first.message) {
      const text = coalesceContent((first.message as { content?: unknown }).content);
      if (text) return text;
    }
    // Legacy completions dialect (oobabooga and friends) puts text at the
    // choice's top level.
    if (typeof first.text === "string" && first.text.length > 0) return first.text;
    return null;
  }

  if (provider === "anthropic") {
    const content = d.content as Array<{ type?: string; text?: string }> | undefined;
    return content?.find((c) => c.type === "text")?.text ?? null;
  }

  // gemini
  const candidates = d.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined;
  return candidates?.[0]?.content?.parts?.find((p) => typeof p.text === "string")?.text ?? null;
}
