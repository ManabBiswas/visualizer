"use client";

import { useState } from "react";
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from "@/lib/ai/providers";
import { MIN_DRAFT_COUNT, MAX_DRAFT_COUNT } from "@/lib/ai/prompt";

// BYO-key AI quiz drafting drawer. Design contract

type DraftCard = {
  question: string;
  answer: string;
  line: number | null;
};

const LS_KEY = "codelens.ai.providerKey";

export function AiQuizDrawer({
  problemId,
  problemName,
  onClose,
  onAccepted,
}: {
  problemId: string;
  problemName: string;
  onClose: () => void;
  /** Called with the number of newly accepted cards (for a toast). */
  onAccepted: (count: number) => void;
}) {
  // Restore a remembered provider+key from this device only. 
  const [restored] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const saved = JSON.parse(raw) as { provider?: string; key?: string; baseUrl?: string; model?: string };
      if (saved.provider && PROVIDER_IDS.includes(saved.provider as ProviderId)) {
        return {
          provider: saved.provider as ProviderId,
          key: typeof saved.key === "string" ? saved.key : "",
          baseUrl: typeof saved.baseUrl === "string" ? saved.baseUrl : "",
          model: typeof saved.model === "string" ? saved.model : "",
        };
      }
      return null;
    } catch {
      return null; // corrupt local value — ignore
    }
  });

  const [provider, setProvider] = useState<ProviderId>(restored?.provider ?? "gemini");
  const [apiKey, setApiKey] = useState(restored?.key ?? "");
  const [remember, setRemember] = useState(restored !== null);
  // Custom (OpenAI-compatible) provider fields.
  const [baseUrl, setBaseUrl] = useState(restored?.baseUrl ?? "");
  const [model, setModel] = useState(restored?.model ?? "");
  const [count, setCount] = useState(5);
  const [drafts, setDrafts] = useState<DraftCard[] | null>(null);
  const [acceptedIdx, setAcceptedIdx] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setDrafts(null);
    setAcceptedIdx(new Set());
    try {
      const res = await fetch("/api/ai/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemId,
          provider,
          apiKey: apiKey.trim() === "" ? undefined : apiKey.trim(),
          count,
          ...(provider === "custom" ? { baseUrl: baseUrl.trim(), model: model.trim() } : {}),
        }),
      });
      const d: { drafts?: DraftCard[]; error?: string } = await res.json();
      if (!res.ok || !d.drafts) throw new Error(d.error ?? "Drafting failed.");
      setDrafts(d.drafts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function acceptCard(idx: number) {
    const card = drafts?.[idx];
    if (!card) return;
    setError(null);
    try {
      const res = await fetch("/api/quiz/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ problemId, cards: [card] }),
      });
      const d: { accepted?: number; error?: string } = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Could not add the card.");
      if (d.accepted === 0) {
        setError("That question is already in this problem's deck.");
        return;
      }
      setAcceptedIdx((s) => new Set(s).add(idx));
      onAccepted(1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function updateDraft(idx: number, patch: Partial<DraftCard>) {
    setDrafts((ds) => (ds ? ds.map((c, i) => (i === idx ? { ...c, ...patch } : c)) : ds));
  }

  const hasDrafts = drafts !== null && drafts.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-surface-container-lowest p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="label-caps text-primary">Draft quiz cards with AI — optional</span>
          <span className="text-body-sm text-on-surface-variant">
            Your code and analysis facts for <span className="font-medium">{problemName}</span> will be sent to the
            provider you choose, using your own API key. CodeLens stores nothing.
          </span>
        </div>
        <button onClick={onClose} className="text-body-sm text-text-muted hover:text-on-surface" aria-label="Close AI drafting">
          ✕
        </button>
      </div>

      {!hasDrafts && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="label-caps">Provider</span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ProviderId)}
              className="rounded border border-panel-border bg-surface-container px-2 py-1 text-body-sm text-on-surface"
            >
              {PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {id === "custom" ? PROVIDERS[id].label : `${PROVIDERS[id].label} — ${PROVIDERS[id].model}`}
                </option>
              ))}
            </select>
          </label>
          {provider === "custom" && (
            <>
              <label className="flex flex-col gap-1">
                <span className="label-caps">Base URL (OpenAI-compatible)</span>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.groq.com/openai/v1"
                  className="rounded border border-panel-border bg-surface-container px-2 py-1 font-mono text-code-sm text-on-surface outline-none placeholder:text-text-muted focus:border-primary"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="text-code-sm text-text-muted">
                  Allowed: Groq, OpenRouter, DeepSeek, Together, Mistral, xAI, Cohere, TokenRouter (https) or
                  http://localhost for a local server (Ollama / LM Studio)
                </span>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-caps">Model name</span>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. llama-3.1-8b-instant"
                  className="rounded border border-panel-border bg-surface-container px-2 py-1 font-mono text-code-sm text-on-surface outline-none placeholder:text-text-muted focus:border-primary"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </>
          )}
          <label className="flex flex-col gap-1">
            <span className="label-caps">API key {provider === "custom" && <span className="text-text-muted">(optional)</span>}</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === "custom" ? "provider key — leave empty for keyless local servers" : PROVIDERS[provider].keyHint}
              className="rounded border border-panel-border bg-surface-container px-2 py-1 text-body-sm text-on-surface outline-none placeholder:text-text-muted focus:border-primary"
              autoComplete="off"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Cards to draft: {count}</span>
            <input
              type="range"
              min={MIN_DRAFT_COUNT}
              max={MAX_DRAFT_COUNT}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="accent-primary"
            />
          </label>
          <div className="flex flex-col justify-end gap-1">
            <label className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              remember provider &amp; key on this device
            </label>
            <button
              onClick={() => {
                // Client-side pre-flight: catch the obvious mistakes here so
                // the user gets an instant pointer (server re-validates).
                if (provider === "custom") {
                  if (!baseUrl.trim()) {
                    setError("Enter the custom provider's base URL — e.g. https://api.groq.com/openai/v1");
                    return;
                  }
                  if (!model.trim()) {
                    setError("Enter the model name your custom provider serves — e.g. llama-3.1-8b-instant");
                    return;
                  }
                } else if (apiKey.trim().length < 8) {
                  setError("Paste your API key (it's at least 8 characters).");
                  return;
                }
                if (remember) {
                  try {
                    window.localStorage.setItem(
                      LS_KEY,
                      JSON.stringify({
                        provider,
                        key: apiKey,
                        ...(provider === "custom" ? { baseUrl, model } : {}),
                      }),
                    );
                  } catch {
                    // storage unavailable — session-only
                  }
                } else {
                  try {
                    window.localStorage.removeItem(LS_KEY);
                  } catch {
                    // ignore
                  }
                }
                void generate();
              }}
              disabled={loading}
              className="self-start rounded bg-primary-container px-4 py-1.5 text-body-sm font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-40"
            >
              {loading ? "Drafting…" : "Generate drafts"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-error/40 bg-error-container/20 px-3 py-2 text-body-sm text-error">
          {error}
        </div>
      )}

      {hasDrafts && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="label-caps">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"} — review, edit, then accept
            </span>
            <button
              onClick={() => {
                setDrafts(null);
                setAcceptedIdx(new Set());
              }}
              disabled={loading}
              className="rounded border border-panel-border px-2 py-0.5 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            >
              Start over
            </button>
          </div>
          {drafts.map((card, i) => {
            const done = acceptedIdx.has(i);
            return (
              <div
                key={i}
                className={`flex flex-col gap-2 rounded border p-3 ${
                  done ? "border-success/40 bg-success/10" : "border-panel-border bg-surface-container-low"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="label-caps">{done ? "Added to deck" : `Draft ${i + 1}`}</span>
                  {!done && (
                    <button
                      onClick={() => void acceptCard(i)}
                      className="rounded bg-primary-container px-2 py-0.5 text-body-sm font-medium text-on-primary-container hover:opacity-90"
                    >
                      Accept
                    </button>
                  )}
                </div>
                <textarea
                  value={card.question}
                  onChange={(e) => updateDraft(i, { question: e.target.value })}
                  rows={2}
                  placeholder="Question"
                  disabled={done}
                  className="resize-y rounded bg-surface-container-lowest px-2 py-1 text-body-sm text-on-surface outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <textarea
                  value={card.answer}
                  onChange={(e) => updateDraft(i, { answer: e.target.value })}
                  rows={3}
                  placeholder="Answer"
                  disabled={done}
                  className="resize-y rounded bg-surface-container-lowest px-2 py-1 text-body-sm text-on-surface outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <div className="flex items-center gap-2 text-code-sm text-text-muted">
                  <span>source line</span>
                  <input
                    type="number"
                    min={1}
                    value={card.line ?? ""}
                    onChange={(e) =>
                      updateDraft(i, {
                        line: e.target.value === "" ? null : Math.max(1, Math.floor(Number(e.target.value) || 1)),
                      })
                    }
                    disabled={done}
                    className="w-20 rounded border border-panel-border bg-surface-container-lowest px-1.5 py-0.5 text-code-sm text-on-surface outline-none focus:border-primary"
                    placeholder="—"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
