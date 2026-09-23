"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { InterviewSkeleton } from "@/components/Skeleton";

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
  lapseCount: number;
  source: "ai" | "user";
  // MCQ fields
  choices?: string[];
  correct_index?: number;
  explanation?: string;
};

type InterviewCard = QuizCard & {
  userAnswer: string | number | null;
  isRevealed: boolean;
  isCorrect: boolean | null;
  timeSpent: number;
  _weight: number;
};

const SESSION_DURATION = 20 * 60; // 20 minutes in seconds
const MAX_CARDS = 10;

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function weightCards(cards: QuizCard[]): InterviewCard[] {
  // Weight by lapse_count (higher = more likely) and inverse ease_factor (lower = more likely)
  return cards.map((card) => ({
    ...card,
    userAnswer: null,
    isRevealed: false,
    isCorrect: null,
    timeSpent: 0,
    _weight: (card.lapseCount + 1) * (1 / Math.max(card.state?.easeFactor ?? 2.5, 1.3)),
  }));
}

function pickWeightedRandom(cards: InterviewCard[], count: number): InterviewCard[] {
  const available = [...cards];
  const selected: InterviewCard[] = [];
  
  for (let i = 0; i < count && available.length > 0; i++) {
    const totalWeight = available.reduce((sum, c) => sum + c._weight, 0);
    let random = Math.random() * totalWeight;
    let selectedIndex = 0;
    
    for (let j = 0; j < available.length; j++) {
      random -= available[j]._weight;
      if (random <= 0) {
        selectedIndex = j;
        break;
      }
    }
    
    selected.push(available.splice(selectedIndex, 1)[0]);
  }
  
  return selected;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function InterviewClient() {
  const searchParams = useSearchParams();
  const problemId = searchParams.get("problem");
  const topic = searchParams.get("topic");
  
  const [cards, setCards] = useState<InterviewCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(SESSION_DURATION);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const cardStartTimeRef = useRef<number>(Date.now());
  const totalTimeSpentRef = useRef(0);

  // Load cards on mount
  async function loadCards() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (problemId) params.set("problem", problemId);
      if (topic) params.set("topic", topic);

      const res = await fetch(`/api/quiz?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load cards");
      const data = await res.json();

      if (!data.cards || data.cards.length === 0) {
        setError("No quiz cards found. Add some notes with 'q:' tags or draft AI cards first.");
        setLoading(false);
        return;
      }

      const weighted = weightCards(data.cards);
      const selected = pickWeightedRandom(weighted, Math.min(MAX_CARDS, weighted.length));
      setCards(selected);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemId, topic]);

  // Timer
  useEffect(() => {
    if (!sessionActive || sessionComplete) return;
    
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          endSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sessionActive, sessionComplete]);

  function startSession() {
    setSessionActive(true);
    cardStartTimeRef.current = Date.now();
  }

  function endSession() {
    setSessionActive(false);
    setSessionComplete(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function revealHint() {
    setCards((prev) => {
      const next = [...prev];
      next[currentIndex] = { ...next[currentIndex], isRevealed: true };
      return next;
    });
  }

  function submitAnswer(userAnswer: string | number) {
    const card = cards[currentIndex];
    if (card.isRevealed || card.isCorrect !== null) return;
    
    let isCorrect = false;
    if (card.choices !== undefined && card.correct_index !== undefined) {
      // MCQ
      isCorrect = userAnswer === card.correct_index;
    } else {
      // Open-ended: simple check if answer contains key terms (lenient)
      const userAns = (userAnswer as string).toLowerCase().trim();
      const correctAns = (card.answer || "").toLowerCase().trim();
      // Consider correct if user answer shares significant words with correct answer
      const correctWords = correctAns.split(/\s+/).filter((w) => w.length > 3);
      const userWords = userAns.split(/\s+/).filter((w) => w.length > 3);
      const matches = correctWords.filter((w) => userWords.some((uw) => uw.includes(w) || w.includes(uw)));
      isCorrect = matches.length >= Math.min(2, correctWords.length);
    }
    
    const timeSpent = Math.floor((Date.now() - cardStartTimeRef.current) / 1000);
    totalTimeSpentRef.current += timeSpent;

    setCards((prev) => {
      const next = [...prev];
      next[currentIndex] = {
        ...next[currentIndex],
        userAnswer,
        isCorrect,
        timeSpent,
      };
      return next;
    });
  }

  function advanceCard() {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1);
      cardStartTimeRef.current = Date.now();
    } else {
      endSession();
    }
  }

  function getScore(): { correct: number; total: number } {
    let correct = 0;
    let answered = 0;
    for (const card of cards) {
      if (card.isCorrect !== null) {
        answered++;
        if (card.isCorrect) correct++;
      }
    }
    return { correct, total: answered };
  }

  const currentCard = cards[currentIndex];
  const { correct, total } = getScore();

  if (loading) {
    return <InterviewSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="text-center">
          <div className="flex text-error mb-4">{error}</div>
          <Link href="/analyze" className="rounded bg-primary-container px-4 py-2 text-body-sm font-medium text-on-primary-container hover:opacity-90">
            Go analyze some code
          </Link>
        </div>
      </div>
    );
  }

  if (!sessionActive && !sessionComplete) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <div className="text-center max-w-md">
          <div className="mb-4 text-headline-md text-on-surface">Interview Mode</div>
          <p className="text-body-md text-on-surface-variant mb-6">
            Practice {MAX_CARDS} questions drawn from your deck, weighted toward topics you struggle with.
            Session runs for {SESSION_DURATION / 60} minutes. Hints are hidden until you attempt an answer.
          </p>
          <div className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
            <div>Cards loaded: <span className="font-medium text-on-surface">{cards.length}</span></div>
            <div>Session length: <span className="font-medium text-on-surface">{SESSION_DURATION / 60} minutes</span></div>
            <div>Max questions: <span className="font-medium text-on-surface">{MAX_CARDS}</span></div>
          </div>
        </div>
        <button
          onClick={startSession}
          className="rounded bg-primary-container px-8 py-3 text-body-md font-semibold text-on-primary-container hover:opacity-90"
        >
          Start Interview Session
        </button>
      </div>
    );
  }

  const isMcq = currentCard?.choices !== undefined && currentCard?.correct_index !== undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Header with timer and progress */}
      <header className="flex shrink-0 items-center justify-between border-b border-panel-border bg-surface-container-lowest px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/analyze" className="text-body-sm text-text-muted hover:text-on-surface">
            ← Back
          </Link>
          <div className="flex items-center gap-2">
            <span className="label-caps text-primary">Interview</span>
            <span className="font-mono text-code-sm text-text-muted">
              {currentIndex + 1} / {cards.length}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`font-mono text-code-lg tabular-nums ${
            timeRemaining < 60 ? "text-error" : "text-on-surface"
          }`}>
            {formatTime(timeRemaining)}
          </div>
          <div className="font-mono text-code-sm text-on-surface-variant">
            Score: <span className="text-success">{correct}</span> / {total}
          </div>
        </div>
      </header>

      {/* Card area */}
      <main className="flex-1 overflow-auto p-6">
        {sessionComplete ? (
          // Results screen
          <div className="flex flex-col items-center justify-center gap-6 max-w-2xl mx-auto text-center">
            <h2 className="text-headline-md text-on-surface">Session Complete</h2>
            <div className="flex flex-col gap-2">
              <div className="text-5xl font-bold text-on-surface">{correct} / {total}</div>
              <div className="text-body-md text-on-surface-variant">
                {total > 0 ? Math.round((correct / total) * 100) : 0}% correct
              </div>
              <div className="text-body-sm text-on-surface-variant">
                Total time: {formatTime(totalTimeSpentRef.current)}
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  setLoading(true);
                  setCards([]);
                  setCurrentIndex(0);
                  setSessionActive(false);
                  setSessionComplete(false);
                  setTimeRemaining(SESSION_DURATION);
                  totalTimeSpentRef.current = 0;
                  loadCards();
                }}
                className="rounded bg-primary-container px-6 py-2 text-body-sm font-medium text-on-primary-container hover:opacity-90"
              >
                Retry Session
              </button>
              <Link
                href="/analyze"
                className="rounded border border-panel-border px-6 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              >
                Back to Analyze
              </Link>
            </div>
            
            {/* Detailed review */}
            <details className="w-full max-w-xl mt-8 text-left">
              <summary className="cursor-pointer text-body-sm text-primary hover:underline">Review answers</summary>
              <div className="mt-4 space-y-4">
                {cards.map((card, i) => (
                  <div
                    key={card.id}
                    className={`rounded-lg border p-4 ${
                      card.isCorrect === true ? "border-success/30 bg-success/5" : 
                      card.isCorrect === false ? "border-error/30 bg-error/5" : 
                      "border-panel-border bg-surface-container-lowest"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="label-caps text-primary">Q{i + 1}</span>
                      <span className={`font-mono text-code-sm ${
                        card.isCorrect === true ? "text-success" : 
                        card.isCorrect === false ? "text-error" : "text-text-muted"
                      }`}>
                        {card.isCorrect === true ? "✓ Correct" : card.isCorrect === false ? "✗ Incorrect" : "Unanswered"}
                      </span>
                    </div>
                    <p className="text-body-md text-on-surface mb-2">{card.question}</p>
                    {card.choices !== undefined && card.correct_index !== undefined && (
                      <div className="space-y-1 mb-2">
                        {card.choices.map((choice, ci) => (
                          <div
                            key={ci}
                            className={`text-body-sm px-2 py-1 rounded ${
                              ci === card.correct_index ? "bg-success/10 text-success" :
                              ci === card.userAnswer ? "bg-error/10 text-error" :
                              "text-on-surface-variant"
                            }`}
                          >
                            {ci === card.correct_index && "✓ "}{ci === card.userAnswer && card.userAnswer !== card.correct_index && "✗ "}{choice}
                          </div>
                        ))}
                      </div>
                    )}
                    {!(card.choices !== undefined && card.correct_index !== undefined) && (
                      <div className="text-body-sm text-on-surface-variant">
                        <span className="font-medium">Your answer:</span> {card.userAnswer || "(none)"}
                      </div>
                    )}
                    <div className="text-body-sm text-on-surface-variant">
                      <span className="font-medium">Correct answer:</span> {card.answer || "(none)"}
                    </div>
                    {card.explanation && (
                      <div className="mt-2 text-body-sm text-primary">{card.explanation}</div>
                    )}
                    <div className="mt-2 text-code-sm text-text-muted">
                      {card.problemName} · {formatTime(card.timeSpent)}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : currentCard ? (
          // Active question
          <div className="max-w-3xl mx-auto">
            <div className="mb-4 flex items-center gap-2 text-body-sm text-on-surface-variant">
              <span className="px-2 py-0.5 rounded bg-surface-container-high font-mono text-code-sm">
                {currentCard.problemName}
              </span>
              {currentCard.topics.length > 0 && (
                <span className="px-2 py-0.5 rounded bg-primary-container/20 text-primary text-code-sm">
                  {currentCard.topics[0]}
                </span>
              )}
              {currentCard.source === "ai" && (
                <span className="px-2 py-0.5 rounded bg-purple-container/20 text-purple text-code-sm">AI</span>
              )}
            </div>

            <div className={`rounded-xl border p-6 ${
              currentCard.isRevealed ? "border-primary/30 bg-primary/5" : "border-panel-border bg-surface-container-lowest"
            }`}>
              <h3 className="text-body-md text-on-surface mb-4">{currentCard.question}</h3>

              {isMcq && currentCard.choices ? (
                <div className="space-y-3">
                  {currentCard.choices.map((choice, ci) => (
                    <button
                      key={ci}
                      onClick={() => currentCard.isCorrect === null && submitAnswer(ci)}
                      disabled={currentCard.isCorrect !== null}
                      className={`w-full text-left rounded-lg border p-4 text-body-sm ${
                        currentCard.isCorrect !== null
                          ? ci === currentCard.correct_index
                            ? "border-success bg-success/10 text-success"
                            : ci === currentCard.userAnswer
                            ? "border-error bg-error/10 text-error"
                            : "border-panel-border bg-surface-container-lowest text-on-surface-variant"
                          : "border-panel-border bg-surface-container-lowest hover:border-primary hover:bg-surface-container text-on-surface"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center font-mono text-code-sm ${
                          currentCard.isCorrect !== null
                            ? ci === currentCard.correct_index
                              ? "border-success text-success bg-success/10"
                              : ci === currentCard.userAnswer
                              ? "border-error text-error bg-error/10"
                              : "border-panel-border text-text-muted"
                            : "border-panel-border text-text-muted"
                        }`}>
                          {String.fromCharCode(65 + ci)}
                        </span>
                        <span className="flex-1">{choice}</span>
                        {currentCard.isRevealed && ci === currentCard.correct_index && (
                          <span className="text-success font-medium">✓ Correct</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <textarea
                    value={(currentCard.userAnswer as string) || ""}
                    onChange={(e) => currentCard.isCorrect === null && setCards((prev) => {
                      const next = [...prev];
                      next[currentIndex] = { ...next[currentIndex], userAnswer: e.target.value };
                      return next;
                    })}
                    rows={4}
                    placeholder="Type your answer here…"
                    disabled={currentCard.isCorrect !== null}
                    className="w-full resize-y rounded border border-panel-border bg-surface-container px-3 py-2 text-body-md text-on-surface outline-none focus:border-primary disabled:opacity-50"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => currentCard.isCorrect === null && submitAnswer(currentCard.userAnswer as string)}
                      disabled={currentCard.isCorrect !== null || !currentCard.userAnswer}
                      className="flex-1 rounded bg-primary-container px-4 py-2 text-body-sm font-medium text-on-primary-container hover:opacity-90 disabled:opacity-40"
                    >
                      Submit Answer
                    </button>
                    <button
                      onClick={revealHint}
                      disabled={currentCard.isRevealed || currentCard.isCorrect !== null}
                      className="flex-1 rounded border border-panel-border px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40"
                    >
                      Reveal Hint
                    </button>
                  </div>
                </div>
              )}

              {currentCard.isRevealed && !isMcq && (
                <div className="mt-4 pt-4 border-t border-panel-border">
                  <div className="text-body-sm text-on-surface-variant">
                    <span className="font-medium">Answer:</span> {currentCard.answer || "(no answer stored)"}
                  </div>
                </div>
              )}

              {currentCard.isRevealed && isMcq && currentCard.explanation && (
                <div className="mt-4 pt-4 border-t border-panel-border">
                  <div className="text-body-sm text-primary">
                    <span className="font-medium">Explanation:</span> {currentCard.explanation}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={advanceCard}
                  disabled={currentCard.isCorrect === null}
                  className="rounded bg-primary-container px-6 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90 disabled:opacity-40"
                >
                  {currentIndex < cards.length - 1 ? "Next →" : "Finish Session"}
                </button>
              </div>
            </div>

            {/* Navigation */}
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => currentIndex > 0 && (setCurrentIndex((i) => i - 1), cardStartTimeRef.current = Date.now())}
                disabled={currentIndex === 0}
                className="rounded border border-panel-border px-4 py-2 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface disabled:opacity-40"
              >
                ← Previous
              </button>
              <div className="flex items-center gap-2 text-body-sm text-text-muted">
                Question {currentIndex + 1} of {cards.length}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center text-on-surface-variant">No cards available</div>
        )}
      </main>
    </div>
  );
}