"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { TOPICS } from "@/lib/topics";
import { Grade } from "@/lib/spaced/repetition";
import { cardsToAnkiTxt } from "@/lib/export/anki";
import { downloadText } from "@/lib/export/download";
import { SignInPrompt } from "@/components/SignInPrompt";

type QuizCard = {
  id: string;
  problemId: string;
  question: string;
  answer: string | null;
  lineNumber: number | null;
  problemName: string;
  topics: string[];
  state: {
    repetitions: number;
    easeFactor: number;
    intervalDays: number;
    dueDate: string;
    lastReviewed: string | null;
  } | null;
  due: boolean;
};

function QuizPage() {
  const searchParams = useSearchParams();
  const problemFilter = searchParams.get("problem");
  const { status } = useSession();

  const [allCards, setAllCards] = useState<QuizCard[]>([]);
  const [queue, setQueue] = useState<QuizCard[]>([]);
  const [topicFilter, setTopicFilter] = useState("");
  const [dueOnly, setDueOnly] = useState(true);
  // When set, a focus session is active: the banner lists the drilled topics
  // and the queue came from /api/quiz?focus=weakest instead of the filters.
  const [focusTopics, setFocusTopics] = useState<string[] | null>(null);
  const [focusLoading, setFocusLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [answerDraft, setAnswerDraft] = useState("");
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  const loadCards = useCallback(() => {
    // Quiz cards are per-account; skip the doomed 401 request when
    // signed out — the SignInPrompt covers that case instead.
    if (status !== "authenticated") return;
    const params = new URLSearchParams();
    if (topicFilter) params.set("topic", topicFilter);
    if (problemFilter) params.set("problem", problemFilter);
    if (dueOnly) params.set("due", "1");
    fetch(`/api/quiz?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setAllCards(d.cards ?? []);
        setQueue(d.cards ?? []);
        setReviewed(0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [topicFilter, problemFilter, dueOnly, status]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  async function startFocusSession() {
    setFocusLoading(true);
    try {
      const res = await fetch("/api/quiz?focus=weakest");
      const d: { cards?: QuizCard[]; focus?: string[] } = await res.json();
      setQueue(d.cards ?? []);
      setFocusTopics(d.focus ?? []);
      setReviewed(0);
      setLoading(false);
    } catch {
      setNotice("Could not build a focus session.");
    } finally {
      setFocusLoading(false);
    }
  }

  function exitFocusSession() {
    setFocusTopics(null);
    setLoading(true);
    loadCards();
  }

  const current = queue[0];

  // Reset per-card UI state when the active card changes
  // (render-phase state adjustment — React's recommended pattern).
  const [prevCardId, setPrevCardId] = useState<string | undefined>(current?.id);
  if (prevCardId !== current?.id) {
    setPrevCardId(current?.id);
    setAnswerDraft(current?.answer ?? "");
    setRevealed(false);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT") return;
      if (e.code === "Space" && current && !revealed) {
        e.preventDefault();
        setRevealed(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed]);

  async function grade(card: QuizCard, g: Grade) {
    try {
      const res = await fetch("/api/quiz/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: card.id, grade: g }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Review failed.");
      setReviewed((n) => n + 1);
      setQueue((q) => {
        const rest = q.slice(1);
        return g === "again" ? [...rest, { ...card, due: true }] : rest;
      });
    } catch (e) {
      setNotice((e as Error).message);
    }
  }

  async function saveAnswer(card: QuizCard) {
    setSavingAnswer(true);
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(card.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: answerDraft }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed.");
      setQueue((q) => q.map((c) => (c.id === card.id ? { ...c, answer: answerDraft.trim() || null } : c)));
      setAllCards((cs) => cs.map((c) => (c.id === card.id ? { ...c, answer: answerDraft.trim() || null } : c)));
      setNotice("Answer saved.");
      setTimeout(() => setNotice(null), 2000);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setSavingAnswer(false);
    }
  }

  function exportAnki() {
    downloadText(
      cardsToAnkiTxt(allCards.map((c) => ({ question: c.question, answer: c.answer }))),
      "codelens-quiz.txt",
      "text/plain"
    );
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-panel-padding">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-headline-md text-text-high-contrast">Quiz</h1>
          <p className="text-body-sm text-text-muted">
            {allCards.filter((c) => c.due).length} due · {allCards.length} card
            {allCards.length === 1 ? "" : "s"} in this view · {reviewed} reviewed this session
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!focusTopics && (
            <>
              <select
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.target.value);
              setFocusTopics(null);
              setLoading(true);
            }}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface"
            aria-label="Filter by topic"
          >
            <option value="">All topics</option>
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-body-sm text-on-surface-variant">
            <input
              type="checkbox"
              checked={dueOnly}
              onChange={(e) => {
                setDueOnly(e.target.checked);
                setFocusTopics(null);
                setLoading(true);
              }}
            />
            due only
          </label>
            </>
          )}
          <button
            disabled={focusLoading || allCards.length === 0}
            onClick={startFocusSession}
            className="rounded bg-primary-container px-2 py-1 text-body-sm font-medium text-on-primary-container hover:opacity-90 disabled:opacity-40"
            title="Drill up to 10 cards from your weakest topics (lowest average ease)"
          >
            {focusLoading && focusTopics === null ? "Building…" : "Focus session"}
          </button>
          <button
            disabled={allCards.length === 0}
            onClick={exportAnki}
            className="rounded bg-surface-container-high px-2 py-1 text-body-sm text-on-surface hover:text-primary disabled:opacity-40"
            title="Export these cards for Anki (tab-separated .txt)"
          >
            Anki .txt
          </button>
        </div>
      </div>

      {notice && <div className="mb-3 rounded border border-panel-border bg-surface-container px-3 py-2 text-body-sm text-on-surface">{notice}</div>}

      {focusTopics && (
        <div className="mb-3 flex items-center gap-3 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-body-sm text-on-surface">
          <span className="min-w-0 flex-1">
            Focus session — drilling your weakest topics:{" "}
            <span className="font-medium text-primary">
              {focusTopics.length > 0 ? focusTopics.join(", ") : "your untagged cards"}
            </span>
          </span>
          <button
            onClick={exitFocusSession}
            className="shrink-0 rounded border border-panel-border px-2 py-0.5 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            Exit session
          </button>
        </div>
      )}

      {status === "unauthenticated" ? (
        <SignInPrompt
          title="Sign in to review your quiz cards"
          message="Your spaced-repetition deck is built from the // q: comments in your solutions. Sign in to keep reviewing where you left off."
          callbackUrl={problemFilter ? `/quiz?problem=${problemFilter}` : "/quiz"}
        />
      ) : loading ? (
        <p className="text-body-sm text-text-muted">Loading…</p>
      ) : !current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-body-sm text-text-muted">
          <p>No quiz cards in this view.</p>
          <p>
            Add <code className="font-mono text-code-sm text-primary">{"// q: your question"}</code> comments to your
            solutions and analyze them — every question becomes a revision card here.
          </p>
          {dueOnly && allCards.length === 0 && (
            <button
              onClick={() => {
                setDueOnly(false);
                setLoading(true);
              }}
              className="rounded bg-surface-container-high px-2 py-1 text-on-surface hover:text-primary"
            >
              Show all cards anyway
            </button>
          )}
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          <div className="flex items-center justify-between text-code-sm text-text-muted">
            <span>
              {current.problemName}
              {current.topics.length > 0 && ` · ${current.topics.join(", ")}`}
            </span>
            <span>{queue.length} left</span>
          </div>

          <div className="rounded-md border border-primary/40 bg-surface-container p-4">
            <span className="label-caps text-primary">Question</span>
            <p className="mt-1 text-body-md text-text-high-contrast">{current.question}</p>
          </div>

          {!revealed ? (
            <button
              onClick={() => setRevealed(true)}
              className="self-start rounded bg-primary-container px-4 py-1.5 text-body-sm font-medium text-on-primary-container"
            >
              Reveal answer (space)
            </button>
          ) : (
            <>
              <div className="flex flex-col gap-2 rounded-md border border-panel-border bg-surface-container p-4">
                <span className="label-caps">Answer</span>
                <textarea
                  value={answerDraft}
                  onChange={(e) => setAnswerDraft(e.target.value)}
                  rows={3}
                  placeholder="Recall it out loud first, then write the answer here to build your deck…"
                  className="resize-y rounded bg-surface-container-lowest px-2 py-1 text-body-sm text-on-surface outline-none focus-visible:ring-1 focus-visible:ring-primary"
                />
                <button
                  onClick={() => saveAnswer(current)}
                  disabled={savingAnswer || answerDraft.trim() === (current.answer ?? "")}
                  className="self-start rounded bg-surface-container-high px-3 py-1 text-body-sm text-on-surface hover:text-primary disabled:opacity-40"
                >
                  {savingAnswer ? "Saving…" : "Save answer"}
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => grade(current, "again")}
                  className="flex-1 rounded border border-error/50 bg-error/10 px-3 py-2 text-body-sm text-error hover:bg-error/20"
                  title="Forgot it — see this card again today"
                >
                  Again
                </button>
                <button
                  onClick={() => grade(current, "good")}
                  className="flex-1 rounded border border-primary/50 bg-primary/10 px-3 py-2 text-body-sm text-primary hover:bg-primary/20"
                  title="Recalled it — schedule the next review"
                >
                  Good
                </button>
                <button
                  onClick={() => grade(current, "easy")}
                  className="flex-1 rounded border border-success/50 bg-success/10 px-3 py-2 text-body-sm text-success hover:bg-success/20"
                  title="Too easy — push the review further out"
                >
                  Easy
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuizPageWithSuspense() {
  return (
    <Suspense fallback={<div className="p-panel-padding text-body-sm text-text-muted">Loading quiz…</div>}>
      <QuizPage />
    </Suspense>
  );
}
