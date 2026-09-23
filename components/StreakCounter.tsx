"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

// Compact day-streak badge for the top nav. Fetches the lightweight
// /api/progress/streak endpoint once per sign-in; silently hidden on any
// error or while signed out so the nav never shows a broken chip.
export function StreakCounter() {
  const { status } = useSession();
  const [streak, setStreak] = useState<number | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    fetch("/api/progress/streak")
      .then(async (r) => {
        if (!r.ok) return null;
        const d = (await r.json()) as { streak?: unknown };
        return typeof d.streak === "number" ? d.streak : null;
      })
      .then((s) => {
        if (!cancelled) setStreak(s);
      })
      .catch(() => {
        if (!cancelled) setStreak(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  // Guard on status too: after sign-out the stale streak state must not show.
  if (status !== "authenticated" || streak === null || streak <= 0) return null;

  return (
    <Link
      href="/progress"
      className="flex items-center gap-1 rounded border border-panel-border px-2 py-1 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      title={`${streak}-day activity streak — view progress`}
      aria-label={`${streak}-day activity streak`}
    >
      <span aria-hidden="true">🔥</span>
      <span className="font-mono font-semibold">{streak}</span>
    </Link>
  );
}
