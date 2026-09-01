"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { SignInPrompt } from "@/components/SignInPrompt";
import type { ProgressStats } from "@/lib/progress/stats";

const DIFFICULTY_COLOR: Record<string, string> = {
  Easy: "text-success",
  Medium: "text-warning",
  Hard: "text-error",
};

// Heatmap intensity buckets: 0 -> muted, 4 -> strong.
function heatClass(count: number): string {
  if (count <= 0) return "bg-surface-container-high";
  if (count === 1) return "bg-primary/25";
  if (count === 2) return "bg-primary/45";
  if (count <= 4) return "bg-primary/70";
  return "bg-primary";
}

export default function ProgressPage() {
  const { status } = useSession();
  const [stats, setStats] = useState<ProgressStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/progress")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Could not load progress.");
        return d as ProgressStats;
      })
      .then((d) => {
        if (!cancelled) {
          setStats(d);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === "loading" || (status === "authenticated" && loading)) {
    return <div className="p-panel-padding text-body-sm text-text-muted">Loading progress…</div>;
  }

  if (status !== "authenticated") {
    return (
      <SignInPrompt
        title="Sign in to see your progress"
        message="Your streak, heatmap and per-topic mastery live in your account."
        callbackUrl="/progress"
      />
    );
  }

  if (error) {
    return <div className="p-panel-padding text-body-sm text-error">{error}</div>;
  }

  if (!stats) return null;

  const maxTopicCards = Math.max(1, ...stats.topics.map((t) => t.cards));
  const activeToday = stats.heatmap[stats.heatmap.length - 1];

  return (
    <div data-scroll className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-container-margin py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-headline-lg text-text-high-contrast">Progress</h1>
            <p className="text-body-sm text-on-surface-variant">
              Your revision loop at a glance — activity, streaks and per-topic mastery.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/quiz?due=1"
              className="rounded bg-primary-container px-4 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
            >
              Review due ({stats.totals.dueToday})
            </Link>
            <Link
              href="/analyze"
              className="rounded border border-panel-border px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            >
              Solve something new
            </Link>
          </div>
        </header>

        {/* Totals strip */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Problems", value: stats.totals.problems },
            { label: "Cards", value: stats.totals.cards },
            { label: "Reviewed", value: stats.totals.reviewedCards },
            { label: "Due today", value: stats.totals.dueToday },
            { label: "Day streak", value: stats.totals.streak },
          ].map((s) => (
            <div key={s.label} className="panel flex flex-col gap-1 rounded-lg p-4">
              <span className="label-caps">{s.label}</span>
              <span className="text-3xl font-semibold text-text-high-contrast">{s.value}</span>
            </div>
          ))}
        </section>

        {/* 30-day activity heatmap */}
        <section className="panel flex flex-col gap-3 rounded-lg p-5">
          <div className="flex items-baseline justify-between">
            <span className="label-caps">Last 30 days</span>
            <span className="text-body-sm text-text-muted">
              blue = problems saved · ring = cards reviewed — hover a cell for details
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.heatmap.map((d) => {
              const title = `${d.date}: ${d.problems} problem${d.problems === 1 ? "" : "s"}, ${d.reviews} review${d.reviews === 1 ? "" : "s"}`;
              return (
                <div
                  key={d.date}
                  title={title}
                  className={`h-5 w-5 rounded-sm ${heatClass(d.problems)} ${
                    d.reviews > 0 ? "ring-2 ring-inset ring-primary" : ""
                  } ${d.date === activeToday?.date ? "outline outline-1 outline-primary" : ""}`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 text-code-sm text-text-muted">
            <span>less</span>
            {[0, 1, 2, 3, 5].map((c) => (
              <span key={c} className={`h-3 w-3 rounded-sm ${heatClass(c)}`} />
            ))}
            <span>more</span>
          </div>
        </section>

        {/* Per-topic mastery */}
        <section className="panel flex flex-col gap-3 rounded-lg p-5">
          <div className="flex items-baseline justify-between">
            <span className="label-caps">Topic mastery</span>
            <span className="text-body-sm text-text-muted">
              bar width = card count · position = average ease (lower = weaker)
            </span>
          </div>
          {stats.topics.length === 0 ? (
            <p className="text-body-sm text-text-muted">
              No cards yet — tag a comment with{" "}
              <code className="font-mono text-code-sm text-primary">{"// q: ..."}</code> in the editor and
              analyze it to create your first card.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.topics.map((t) => (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate font-mono text-code-sm text-on-surface" title={t.topic}>
                    {t.topic}
                  </span>
                  <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-container-high">
                    <div
                      className="h-full rounded bg-primary/60"
                      style={{ width: `${(t.cards / maxTopicCards) * 100}%` }}
                    />
                    {t.avgEase !== null && (
                      <span
                        className="absolute top-0 h-full w-0.5 bg-error"
                        style={{ left: `${((t.avgEase - 1.3) / 1.7) * 100}%` }}
                        title={`avg ease ${t.avgEase.toFixed(2)}`}
                      />
                    )}
                  </div>
                  <span className="w-24 shrink-0 text-right font-mono text-code-sm text-text-muted">
                    {t.cards} card{t.cards === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="text-code-sm text-text-muted">
            The red marker shows the average ease factor on the 1.3–3.0 scale — cards further left are
            the ones you keep forgetting. Drill them from the{" "}
            <Link href="/quiz" className="text-primary hover:underline">
              quiz
            </Link>
            .
          </div>
        </section>

        <footer className="text-center text-code-sm text-text-muted">
          Data: your problems, q-tagged notes and review history.
        </footer>
      </div>
    </div>
  );
}
