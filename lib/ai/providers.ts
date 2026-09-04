// Provider registry for the BYO-key AI quiz drafting.

import type { PromptMessages } from "./prompt";

export type ProviderId = "openai" | "gemini" | "anthropic" | "custom";

export type ProviderSpec = {
  id: ProviderId;
  label: string;
  model: string;
  /** Pinned endpoint — no user input reaches any part of this URL. */
  url: string;
  /** Key length bounds used by the route's validation (before sending). */
  keyHint: string;
  /** Fixed request path appended to a custom base URL. */
  path?: string;
};

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    model: "gpt-4o-mini",
    url: "https://api.openai.com/v1/chat/completions",
    keyHint: "sk-… (from platform.openai.com)",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    model: "gemini-3.0-flash",
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash:generateContent",
    keyHint: "AIza… (from aistudio.google.com)",
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    model: "claude-haiku-4-5",
    url: "https://api.anthropic.com/v1/messages",
    keyHint: "sk-ant-… (from console.anthropic.com)",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    // Placeholder only — the real URL is derived from the user's validated
    // baseUrl + this fixed path (Groq, OpenRouter, DeepSeek, local Ollama…).
    model: "",
    url: "",
    path: "/chat/completions",
    keyHint: "Your provider's key (leave default if none)",
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export function isProviderId(raw: unknown): raw is ProviderId {
  // Own-property check only — `raw in PROVIDERS` would match the prototype
  // chain ("__proto__", "constructor", …) and let injection through.
  return (
    typeof raw === "string" &&
    Object.prototype.hasOwnProperty.call(PROVIDERS, raw) &&
    PROVIDERS[raw as ProviderId] !== undefined
  );
}

/** Normalized request for any provider: messages + bounded generation. */
export type ProviderRequest = {
  url: string;
  headers: Record<string, string>;
  body: string;
  /** True when the response is an SSE stream the route must consume. */
  stream?: boolean;
};

/** Sane bounds for the user-supplied key (length only, never content). */
export const MIN_KEY_CHARS = 8;
export const MAX_KEY_CHARS = 300;

export function isValidKeyShape(raw: unknown): raw is string {
  return typeof raw === "string" && raw.length >= MIN_KEY_CHARS && raw.length <= MAX_KEY_CHARS;
}

// Generation caps: quiz cards are small; a huge completion is a runaway.
const MAX_OUTPUT_TOKENS = 2000;
const TEMPERATURE = 0.4;

// ---------- Custom provider (OpenAI-compatible endpoint) ----------

export const MIN_CUSTOM_BASE_URL_CHARS = 8;
export const MAX_CUSTOM_BASE_URL_CHARS = 200;
export const MAX_CUSTOM_MODEL_CHARS = 100;

// Hostnames custom providers may live at. All of these expose
// OpenAI-compatible /chat/completions endpoints.
const CUSTOM_HOST_ALLOWLIST = [
  "api.groq.com",
  "openrouter.ai",
  "api.deepseek.com",
  "api.together.xyz",
  "api.mistral.ai",
  "api.x.ai",
  "api.cohere.ai",
  "gateway.ai.cloudflare.com",
  "api.inference.wasmcloud.ai", // wasmCloud hosted inference gateway
  "api.tokenrouter.com", // token-router multi-model gateway
];


export function validateCustomBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < MIN_CUSTOM_BASE_URL_CHARS || trimmed.length > MAX_CUSTOM_BASE_URL_CHARS) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  if (isLocal) {
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } else {
    if (url.protocol !== "https:") return null;
    // DNS-safe hostname only: letters, digits, dots, hyphens, IPv6 brackets.
    if (!/^\[?[a-z0-9.-]+\]?(\.[a-z0-9-]+)+$/.test(host)) return null;
    const allowed = CUSTOM_HOST_ALLOWLIST.some(
      (h) => host === h || host.endsWith(`.${h}`),
    );
    if (!allowed) return null;
  }

  // No credentials embedded, no fragments, no query — we own the path.
  if (url.username || url.password || url.search || url.hash) return null;

  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** Validates a custom model name (bounded, no whitespace/control chars). */
export function validateCustomModel(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.trim();
  if (!clean || clean.length > MAX_CUSTOM_MODEL_CHARS || /[\s]/.test(clean)) return null;
  return clean;
}

/** Key requirement: custom providers may be keyless (local Ollama). */
export const CUSTOM_NO_KEY = "codelens-no-key";


export function buildRequest(
  provider: ProviderId,
  apiKey: string,
  messages: PromptMessages,
  custom?: { baseUrl: string; model: string },
): ProviderRequest {
  if (provider === "custom") {
    const base = custom?.baseUrl;
    const model = custom?.model;
    if (!base || !model) {
      throw new Error("Custom provider requires a validated base URL and model.");
    }
    const path = PROVIDERS.custom.path ?? "/chat/completions";
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Local/keyless servers still get a syntactically valid bearer header.
    if (apiKey && apiKey !== CUSTOM_NO_KEY) headers.Authorization = `Bearer ${apiKey}`;
    return {
      url: `${base}${path}`,
      headers,
      // Streaming per the OpenAI-compatible wire format: bytes flow while
      // free-tier models queue, so idle-connection timeouts never fire.
      // The server consumes the SSE and returns one JSON payload — the
      // drawer API is unchanged.
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
        temperature: TEMPERATURE,
        max_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        stream_options: { include_usage: true },
      }),
      stream: true,
    };
  }

  const spec = PROVIDERS[provider];
  switch (provider) {
    case "openai":
      return {
        url: spec.url,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        // Same streaming setup as the custom provider (the wire format is
        // identical) — the route consumes the SSE either way.
        body: JSON.stringify({
          model: spec.model,
          messages: [
            { role: "system", content: messages.system },
            { role: "user", content: messages.user },
          ],
          temperature: TEMPERATURE,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          stream_options: { include_usage: true },
        }),
        stream: true,
      };
    case "gemini":
      // Gemini has no system role in v1beta generateContent — systemPrompt
      // rides as a systemInstruction; the key travels as a query param
      // because that's the documented auth mode for this endpoint.
      return {
        url: `${spec.url}?key=${encodeURIComponent(apiKey)}`,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: messages.system }] },
          contents: [{ role: "user", parts: [{ text: messages.user }] }],
          generationConfig: {
            temperature: TEMPERATURE,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
          },
        }),
      };
    case "anthropic":
      return {
        url: spec.url,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: spec.model,
          system: messages.system,
          messages: [{ role: "user", content: messages.user }],
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: TEMPERATURE,
        }),
      };
  }
}


