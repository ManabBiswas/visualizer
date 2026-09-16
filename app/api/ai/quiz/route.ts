import { NextRequest, NextResponse } from "next/server";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId, parseJsonArray } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { isRateLimited } from "@/lib/security/rateLimit";
import { buildQuizPrompt, MIN_DRAFT_COUNT, MAX_DRAFT_COUNT } from "@/lib/ai/prompt";
import { buildRequest, isProviderId, isValidKeyShape, PROVIDERS, validateCustomBaseUrl, validateCustomModel, CUSTOM_NO_KEY } from "@/lib/ai/providers";
import { parseDraftCards } from "@/lib/ai/parse";
import { extractModelText as extractModelTextModule } from "@/lib/ai/extract";
import { newAccumulator, feedSseEvent, normalizeSse, splitSseBuffer } from "@/lib/ai/stream";
import type { ProgramIR } from "@/lib/ir";

// AI quiz drafting — BYO-key, human-in-the-loop.

// The user's API key is request-scoped: validated for shape, sent only to the provider's HARDCODED endpoint, never logged, and string-redacted from any error before it reaches the client. Drafts are returned for review — nothing is persisted by this route.

const RATE_LIMIT_PER_MINUTE = 5;
// Pinned providers (OpenAI/Gemini/Anthropic) are fast; custom providers get
// a much longer budget — free-tier gateways queue requests, local Ollama
// servers cold-start multi-GB models, and THINKING models (GLM, R1) reason
// per-card, so 7-10 card drafts can legitimately take several minutes.
const FETCH_TIMEOUT_MS_PINNED = 30_000;
const FETCH_TIMEOUT_MS_CUSTOM = 300_000;

/**
 * Coalesces an OpenAI-style message content that may be a plain string OR
 * an array of typed parts — see lib/ai/extract.ts (unit-tested there for
 * every provider dialect, including gateway content arrays).
 */
function extractModelText(provider: string, data: unknown): string | null {
  return extractModelTextModule(provider as "openai" | "gemini" | "anthropic" | "custom", data);
}

function labelFor(
  provider: string,
  custom: { baseUrl: string; model: string } | undefined,
): string {
  return provider === "custom" ? `The custom provider (${custom!.model})` : PROVIDERS[provider as "openai" | "gemini" | "anthropic"].label;
}

export async function POST(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to draft quiz cards with AI." }, { status: 401 });
  }

  // Keyed on the SESSION user, not the client IP — this route is
  // auth-required anyway, and X-Forwarded-For is client-controlled behind
  // Vercel's proxy, so an IP key could be rotated to bypass the limit.
  if (await isRateLimited(`ai:${userId}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json(
      { error: "Too many AI drafting requests — try again in a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { problemId, provider, apiKey, count, baseUrl, model, format } = (body ?? {}) as Record<string, unknown>;

  if (typeof problemId !== "string" || !isValidId(problemId)) {
    return NextResponse.json({ error: "Invalid `problemId`." }, { status: 400 });
  }
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "`provider` must be openai, gemini, anthropic, or custom." }, { status: 400 });
  }

  // Custom provider: validate baseUrl + model BEFORE anything else so the
  // user gets an exact pointer to the broken field.
  let custom: { baseUrl: string; model: string } | undefined;
  if (provider === "custom") {
    const normalizedBase = validateCustomBaseUrl(baseUrl);
    if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
      return NextResponse.json(
        { error: "Custom provider needs a base URL — e.g. https://api.groq.com/openai/v1" },
        { status: 400 },
      );
    }
    if (normalizedBase === null) {
      return NextResponse.json(
        {
          error:
            "That base URL is not allowed. It must be https:// on an allowed host (api.groq.com, openrouter.ai, api.deepseek.com, api.together.xyz, api.mistral.ai, api.x.ai, api.cohere.ai, api.tokenrouter.com) — or http://localhost for a local server. No IP addresses, credentials, ports, or query strings.",
        },
        { status: 400 },
      );
    }
    const cleanModel = validateCustomModel(model);
    if (cleanModel === null) {
      return NextResponse.json(
        { error: "Custom provider needs a model name — e.g. llama-3.1-8b-instant (no spaces)." },
        { status: 400 },
      );
    }
    custom = { baseUrl: normalizedBase, model: cleanModel };
  }

  // Key rules: pinned providers always need a real key; custom may be
  // keyless (local Ollama) via the explicit sentinel.
  if (provider !== "custom" && !isValidKeyShape(apiKey)) {
    return NextResponse.json(
      { error: "Invalid `apiKey` — check the key in your provider dashboard." },
      { status: 400 },
    );
  }
  if (provider === "custom" && apiKey !== undefined && apiKey !== null && !isValidKeyShape(apiKey) && apiKey !== CUSTOM_NO_KEY) {
    return NextResponse.json(
      { error: "Invalid `apiKey` for the custom provider — paste the provider's key, or leave it empty for keyless local servers." },
      { status: 400 },
    );
  }
  const effectiveKey = provider === "custom" ? (apiKey as string | undefined) ?? CUSTOM_NO_KEY : (apiKey as string);
  const cardCount =
    typeof count === "number" && Number.isInteger(count)
      ? Math.min(MAX_DRAFT_COUNT, Math.max(MIN_DRAFT_COUNT, count))
      : 5;
  const quizFormat = format === "mcq" ? "mcq" : "open";

  // Owner-scoped load of the problem + its latest analysis batch (the IR
  // rides inside analyses.ir_json; a foreign problem is indistinguishable
  // from a missing one). withDb heals a stale Turso stream + retries once.
  let problem: { name: string; difficulty: string | null; topic_tags: string; source_code: string; language: string | null };
  let analyses: Array<{ method_name: string | null; time_complexity: string | null; space_complexity: string | null; ir_json: string | null }>;
  try {
    const loaded = withDb((db) => {
      const p = db
        .prepare("SELECT name, difficulty, topic_tags, source_code, language FROM problems WHERE id = ? AND user_id = ?")
        .get(problemId, userId) as typeof problem | undefined;
      if (!p) return null;
      // Only the newest analysis batch carries the IR the prompt needs;
      // older rows are dead weight (each duplicates the full ProgramIR).
      const rows = db
        .prepare(
          "SELECT method_name, time_complexity, space_complexity, ir_json FROM analyses WHERE problem_id = ? ORDER BY created_at DESC LIMIT 20",
        )
        .all(problemId) as typeof analyses;
      return { p, rows };
    });
    if (!loaded) {
      return NextResponse.json({ error: "Problem not found." }, { status: 404 });
    }
    problem = loaded.p;
    analyses = loaded.rows;
  } catch (err) {
    return NextResponse.json({ error: redactSecrets((err as Error).message) }, { status: 503 });
  }

  const topicTags = parseJsonArray(problem.topic_tags);

  // Re-hydrate the latest IR for grounded facts; fall back to an empty IR
  // (the prompt still carries the source + complexity columns).
  let ir: ProgramIR = { classes: [] };
  const latestIr = analyses.find((a) => a.ir_json);
  if (latestIr?.ir_json) {
    try {
      ir = JSON.parse(latestIr.ir_json) as ProgramIR;
    } catch {
      // keep empty IR
    }
  }

  const prompt = buildQuizPrompt(
    { name: problem.name, difficulty: problem.difficulty, topicTags },
    ir,
    analyses,
    problem.source_code,
    cardCount,
    problem.language === "python" ? "python" : "java",
    quizFormat,
  );
  const request = buildRequest(provider, effectiveKey, prompt, custom);

  // One outbound call, hard timeout. The key never appears in any error
  // path: fetch failures are wrapped with a provider-specific message and
  // every string is redacted via redactSecrets as defense in depth.
  const controller = new AbortController();
  const timeoutMs = provider === "custom" ? FETCH_TIMEOUT_MS_CUSTOM : FETCH_TIMEOUT_MS_PINNED;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });

    if (!res.ok) {
      // Provider rejections — surface status + cause, never the body (it
      // can echo request identifiers or the key itself on misbehaving
      // servers). Each status maps to an actionable message.
      const label = provider === "custom" ? `The custom provider (${custom!.model})` : PROVIDERS[provider].label;
      let error: string;
      if (res.status === 401 || res.status === 403) {
        error =
          provider === "custom"
            ? "The custom provider rejected the API key (401/403). Check the key in your provider's dashboard — or clear it if the server is keyless."
            : `${label} rejected the API key. Check the key in your provider dashboard.`;
      } else if (res.status === 404) {
        error =
          provider === "custom"
            ? `The custom provider returned 404 — the model "${custom!.model}" or the base URL path is wrong. Try e.g. https://api.groq.com/openai/v1 with a model name from your provider's docs.`
            : `${label} returned 404 — the model may have been renamed. Try again or switch providers.`;
      } else if (res.status === 429) {
        error = `${label} is rate-limiting or out of quota (429). Wait a minute, or check your billing/quota page.`;
      } else if (res.status >= 500) {
        error = `${label} had a server error (HTTP ${res.status}). Try again in a moment.`;
      } else {
        error = `${label} returned an error (HTTP ${res.status}). Check the provider settings and try again.`;
      }
      return NextResponse.json({ error: redactSecrets(error) }, { status: 502 });
    }

    // Streaming requests: consume the SSE and accumulate delta.content —
    // the same loop the provider docs show (join chunks at [DONE]). This
    // keeps bytes flowing on slow free-tier models. Non-streaming providers
    // (gemini, anthropic) take the plain-JSON path.
    let text: string | null;
    let streamReasoningChars = 0;
    let streamFinishReason: string | null = null;
    let streamAborted = false;
    if (request.stream) {
      const acc = newAccumulator();
      let buffer = "";
      const reader = res.body?.getReader();
      try {
        if (!reader) throw new Error("no body");
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer = normalizeSse(buffer + decoder.decode(value, { stream: true }));
          const { events, rest } = splitSseBuffer(buffer);
          buffer = rest;
          for (const e of events) feedSseEvent(acc, e);
          if (acc.done) {
            await reader.cancel().catch(() => {});
            break;
          }
        }
      } catch (streamErr) {
        // AbortError = OUR timeout fired (the provider was still streaming);
        // anything else is a genuine mid-stream interruption. Either way,
        // partial text is unusable for strict JSON — report which happened.
        streamAborted = (streamErr as Error).name === "AbortError";
        if (!streamAborted) {
          return NextResponse.json(
            { error: `${labelFor(provider, custom)} stream was interrupted mid-response — try again.` },
            { status: 502 },
          );
        }
      }
      streamReasoningChars = acc.reasoningChars;
      streamFinishReason = acc.finishReason;
      text = acc.text.length > 0 ? acc.text : null;
    } else {
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        return NextResponse.json(
          {
            error:
              provider === "custom"
                ? "The custom provider returned non-JSON — the base URL probably isn't an OpenAI-compatible /chat/completions endpoint."
                : "The model returned an unreadable response — try again.",
          },
          { status: 502 },
        );
      }
      text = extractModelText(provider, data);
    }

    if (!text) {
      // Diagnose WHY no answer text arrived:
      // - timeout abort -> the model was still generating when our budget
      //   expired (thinking models scale reasoning time with card count).
      // - reasoning without content + finish_reason "length" -> the thinking
      //   model exhausted the token budget mid-reasoning.
      // - reasoning without content otherwise -> the model thought but never
      //   answered (some gateway reasoning models emit only reasoning).
      // - no reasoning at all -> dialect mismatch.
      let error: string;
      if (streamAborted) {
        error =
          provider === "custom"
            ? "The model was still generating when the 5-minute budget ran out (thinking models reason longer for more cards). Draft fewer cards — or try a faster non-reasoning model."
            : "The model took too long to respond — try fewer cards or a faster model.";
      } else if (streamReasoningChars > 0 && streamFinishReason === "length") {
        error =
          "The model spent its entire output budget on reasoning and never answered. Try a non-reasoning model (or one with a smaller thinking budget) — reasoning models like GLM think before replying.";
      } else if (streamReasoningChars > 0) {
        error =
          "The model produced reasoning but no answer text. Try a non-reasoning model, or a model/endpoint that returns delta.content.";
      } else if (streamFinishReason === "content_filter") {
        error = "The provider blocked the response (content filter) — try different code or a different model.";
      } else {
        error =
          provider === "custom"
            ? "The custom provider responded, but not in the OpenAI chat format — expected choices[0].message.content (string or text parts). Verify the endpoint is OpenAI-compatible."
            : "The model returned an unreadable response — try again.";
      }
      return NextResponse.json({ error: redactSecrets(error) }, { status: 504 });
    }

    const drafts = parseDraftCards(text);
    if (drafts.length === 0) {
      return NextResponse.json(
        { error: "The model returned no usable cards — try again, lower the card count, or pick a stronger model." },
        { status: 502 },
      );
    }

    return NextResponse.json({ drafts });
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    // DNS/connection failures are common with custom base URLs — name the
    // actual cause (ENOTFOUND/ECONNREFUSED) without leaking the full URL.
    const cause = (err as Error).cause as { code?: string } | undefined;
    const label = labelFor(provider, custom);
    let error: string;
    if (aborted) {
      error =
        provider === "custom"
          ? "The custom provider hit the 5-minute budget — free-tier/thinking models can be slow. Draft fewer cards or pick a faster model."
          : `${label} took over 30 seconds to respond — try a faster model or check the server.`;
    } else if (cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN") {
      error = `${label} host could not be resolved — check the base URL for typos.`;
    } else if (cause?.code === "ECONNREFUSED") {
      error = `${label} refused the connection — if this is a local server, make sure it's running (e.g. ollama serve).`;
    } else {
      error = `${label} request failed — check your connection and try again.`;
    }
    return NextResponse.json({ error: redactSecrets(error) }, { status: 504 });
  } finally {
    clearTimeout(timeout);
  }
}
