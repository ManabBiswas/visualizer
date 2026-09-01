import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/security/rateLimit";
import { parseLeetCodeUrl, questionToMeta, QUESTION_QUERY } from "@/lib/leetcode/url";

// LeetCode's GraphQL endpoint is unofficial for third-party use. We treat it
// as best-effort: any failure (offline, blocked, rate-limited upstream) maps
// to { found: false } so the client can fall back to manual metadata entry.

const RATE_LIMIT_PER_MINUTE = 10;
const FETCH_TIMEOUT_MS = 8_000;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "local";
}

export async function POST(req: NextRequest) {
  const key = `leetcode:${clientIp(req)}`;
  if (isRateLimited(key, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json({ error: "Too many import requests. Try again in a minute." }, { status: 429 });
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url : "";
  const slug = parseLeetCodeUrl(rawUrl);
  if (!slug) {
    return NextResponse.json({ found: false, reason: "not-a-leetcode-problem-url" }, { status: 200 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Hardcoded origin + endpoint; only the validated slug is variable.
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: "https://leetcode.com",
        "User-Agent": "CodeLens/0.2 (problem metadata import)",
      },
      body: JSON.stringify({ query: QUESTION_QUERY, variables: { titleSlug: slug } }),
      signal: controller.signal,
    });
    if (!res.ok) return NextResponse.json({ found: false, reason: "leetcode-unavailable" }, { status: 200 });

    const data: unknown = await res.json();
    const question = (data as { data?: { question?: unknown } })?.data?.question ?? null;
    const meta = question ? questionToMeta(question) : null;
    if (!meta) return NextResponse.json({ found: false, reason: "problem-not-found" }, { status: 200 });
    return NextResponse.json({ found: true, meta });
  } catch {
    return NextResponse.json({ found: false, reason: "import-failed" }, { status: 200 });
  } finally {
    clearTimeout(timeout);
  }
}
