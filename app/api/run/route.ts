import { NextRequest, NextResponse } from "next/server";
import { runJava } from "@/lib/run/execute";
import { validateSource, validateStdin } from "@/lib/security/validate";
import { isRateLimited, tryAcquireRunSlot, releaseRunSlot } from "@/lib/security/rateLimit";
import { getAuthedUserId } from "@/lib/api/user";
import { redactSecrets } from "@/lib/security/env";

const MAX_CONCURRENT_RUNS = 2;
const RATE_LIMIT_PER_MINUTE = 20;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "local";
}

export async function POST(req: NextRequest) {
  // The runner executes arbitrary user code, so it is behind the login wall.
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to run Java code." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { source: rawSource, stdin: rawStdin } = (body ?? {}) as {
    source?: unknown;
    stdin?: unknown;
  };

  const sourceCheck = validateSource(rawSource);
  if (!sourceCheck.ok) {
    return NextResponse.json({ error: sourceCheck.error }, { status: 400 });
  }
  const stdinCheck = validateStdin(rawStdin);
  if (!stdinCheck.ok) {
    return NextResponse.json({ error: stdinCheck.error }, { status: 400 });
  }

  if (isRateLimited(`run:${clientIp(req)}`, RATE_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json(
      { error: "Too many run requests — please slow down." },
      { status: 429 },
    );
  }

  if (!tryAcquireRunSlot(MAX_CONCURRENT_RUNS)) {
    return NextResponse.json(
      { error: "The runner is busy with other requests — try again in a moment." },
      { status: 503 },
    );
  }

  try {
    const result = await runJava(sourceCheck.value, stdinCheck.value);
    // Setup failures (no main method) are user errors; everything else is a
    // legitimate result of running the code, even a non-zero exit.
    if (result.stage === "setup") {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: `Run failed: ${redactSecrets((err as Error).message)}` },
      { status: 500 },
    );
  } finally {
    releaseRunSlot();
  }
}
