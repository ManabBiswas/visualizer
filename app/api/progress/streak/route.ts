import { NextResponse } from "next/server";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { redactSecrets } from "@/lib/security/env";
import { isRateLimited } from "@/lib/security/rateLimit";
import { computeStreak, parseDbTimestamp } from "@/lib/progress/stats";

// Lightweight streak read for the TopNav badge: only the distinct activity
// days matter here, so we avoid pulling full card/topic rows like /api/progress.
export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to see your streak." }, { status: 401 });
  }
  if (await isRateLimited(`streak:${userId}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many requests — please slow down." }, { status: 429 });
  }

  try {
    return withDb((db) => {
      const dayKeyOf = (raw: string): string | null => {
        const ts = parseDbTimestamp(raw);
        if (Number.isNaN(ts)) return null;
        const d = new Date(ts);
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${d.getFullYear()}-${m}-${day}`;
      };

      const activeDays = new Set<string>();
      const problemDays = db
        .prepare(`SELECT DISTINCT created_at FROM problems WHERE user_id = ? LIMIT 2000`)
        .all(userId) as Array<{ created_at: string }>;
      for (const r of problemDays) {
        const key = dayKeyOf(r.created_at);
        if (key) activeDays.add(key);
      }
      const reviewDays = db
        .prepare(
          `SELECT DISTINCT cs.last_reviewed FROM card_states cs
           JOIN notes n ON n.id = cs.note_id
           JOIN problems p ON p.id = n.problem_id
           WHERE p.user_id = ? AND cs.last_reviewed IS NOT NULL LIMIT 2000`,
        )
        .all(userId) as Array<{ last_reviewed: string }>;
      for (const r of reviewDays) {
        const key = dayKeyOf(r.last_reviewed);
        if (key) activeDays.add(key);
      }

      return NextResponse.json({ streak: computeStreak(activeDays) });
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Could not compute streak: ${redactSecrets((err as Error).message)}` },
      { status: 500 },
    );
  }
}
