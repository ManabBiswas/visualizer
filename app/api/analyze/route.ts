import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ProgramIR } from "@/lib/ir";
import { parseSource } from "@/lib/parser";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { analyzeBlockComplexity } from "@/lib/complexity/blocks";
import { extractCommentTags, attachTagsToMethods } from "@/lib/notes/extract";
import { generateCallGraph } from "@/lib/flowchart/callGraph";
import { withDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { redactSecrets } from "@/lib/security/env";
import { validateSource, validateProblemMeta, validateLanguage } from "@/lib/security/validate";
import { isRateLimited, tryAcquireParserSlot, releaseParserSlot } from "@/lib/security/rateLimit";

const MAX_CONCURRENT_PARSERS = 4;
const RATE_LIMIT_PER_MINUTE = 30;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "local";
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { source: rawSource, problem: rawProblem, language: rawLanguage } = (body ?? {}) as {
    source?: unknown;
    problem?: unknown;
    language?: unknown;
  };

  const sourceCheck = validateSource(rawSource);
  if (!sourceCheck.ok) {
    return NextResponse.json({ error: sourceCheck.error }, { status: 400 });
  }
  const metaCheck = validateProblemMeta(rawProblem);
  if (!metaCheck.ok) {
    return NextResponse.json({ error: metaCheck.error }, { status: 400 });
  }
  const problem = metaCheck.value;
  const languageCheck = validateLanguage(rawLanguage);
  if (!languageCheck.ok) {
    return NextResponse.json({ error: languageCheck.error }, { status: 400 });
  }
  const language = languageCheck.value;

  if (await isRateLimited(clientIp(req), RATE_LIMIT_PER_MINUTE, 60_000)) {
    return NextResponse.json(
      { error: "Too many analysis requests — please slow down." },
      { status: 429 },
    );
  }

  if (!tryAcquireParserSlot(MAX_CONCURRENT_PARSERS)) {
    return NextResponse.json(
      { error: "The analyzer is busy with other requests — try again in a moment." },
      { status: 503 },
    );
  }

  let ir: ProgramIR;
  try {
    ir = await parseSource(sourceCheck.value, language);
  } catch (err) {
    const label = language === "python" ? "Python" : "Java";
    return NextResponse.json(
      { error: `Failed to parse ${label} source: ${(err as Error).message}` },
      { status: 422 },
    );
  } finally {
    releaseParserSlot();
  }

  // Shape-guard the parser output: downstream modules trust the IR contract,
  // so refuse to continue if it is violated instead of throwing mid-pipeline.
  if (!ir || !Array.isArray(ir.classes)) {
    return NextResponse.json(
      { error: "Parser returned an unexpected IR shape." },
      { status: 502 },
    );
  }

  const sourceLines = sourceCheck.value.split("\n");
  const tags = extractCommentTags(sourceLines);

  const results = ir.classes.flatMap((cls) =>
    attachTagsToMethods(cls.methods ?? [], tags).map((method) => ({
      className: cls.name,
      method,
      complexity: analyzeComplexity(method),
      blockComplexity: analyzeBlockComplexity(method),
    })),
  );

  // Only present for multi-method problems; the UI hides the tab otherwise.
  // Generated in both themes so the client can display either and always
  // export the light variant. Tooltips (signature + time/space) ride along
  // in a side table — the same injection pipeline the flowchart uses.
  const callGraphResult = generateCallGraph(ir);
  const callGraphLightResult = generateCallGraph(ir, "onCallGraphNodeClick", "light");
  const callGraph = callGraphResult?.diagram ?? null;
  const callGraphLight = callGraphLightResult?.diagram ?? null;
  const callGraphTooltips = callGraphResult?.tooltips ? Object.fromEntries(callGraphResult.tooltips) : null;

  let savedProblemId: string | null = null;
  let saveWarning: string | null = null;
  if (problem) {
    // Saving is user-scoped: the problem log is private per account, so an
    // anonymous request cannot persist anything.
    const userId = await getAuthedUserId();
    if (!userId) {
      return NextResponse.json(
        {
          results,
          callGraph,
          callGraphLight,
          savedProblemId: null,
          saveWarning:
            "Sign in with GitHub to save problems to your log. The analysis below is complete but wasn't saved.",
        },
        { status: 200 },
      );
    }
    try {
      // withDb + one explicit transaction: the whole save (upsert problem,
      // refresh analyses, sync parser-extracted notes) either fully applies
      // or fully rolls back — a crash/stale-stream mid-sequence can no longer
      // leave a problem with deleted analyses, and the retry is idempotent.
      savedProblemId = withDb((db) => {
        db.exec("BEGIN IMMEDIATE");
        try {
          // Upsert by problem name within this user's log: re-analyzing
          // refreshes the row instead of duplicating it, and never touches
          // other users' rows.
          const existing = db
            .prepare("SELECT id FROM problems WHERE name = ? AND user_id = ?")
            .get(problem.name, userId) as { id: string } | undefined;

          let problemId: string;
          if (existing) {
            problemId = existing.id;
            db.prepare(
              `UPDATE problems SET link = ?, topic_tags = ?, difficulty = ?, source_code = ?, language = ?, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
            ).run(
              problem.link,
              JSON.stringify(problem.topicTags),
              problem.difficulty,
              sourceCheck.value,
              language,
              problemId,
            );
            db.prepare("DELETE FROM analyses WHERE problem_id = ?").run(problemId);
            // Preserve user-authored data: only parser-extracted notes are
            // refreshed. User answers, AI-accepted cards and their SM-2
            // review history survive a re-analyze.
            db.prepare(
              "DELETE FROM notes WHERE problem_id = ? AND source IS NULL",
            ).run(problemId);
          } else {
            problemId = randomUUID();
            db.prepare(
              `INSERT INTO problems (id, user_id, name, link, topic_tags, difficulty, source_code, language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
            ).run(
              problemId,
              userId,
              problem.name,
              problem.link,
              JSON.stringify(problem.topicTags),
              problem.difficulty,
              sourceCheck.value,
              language,
            );
          }

          const insertAnalysis = db.prepare(
            `INSERT INTO analyses (id, problem_id, method_name, time_complexity, space_complexity, time_confidence, space_confidence, ir_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const result of results) {
            insertAnalysis.run(
              randomUUID(),
              problemId,
              result.method.name,
              result.complexity.time.bigO,
              result.complexity.space.bigO,
              result.complexity.time.confidence,
              result.complexity.space.confidence,
              JSON.stringify(ir),
            );
          }

          const insertNote = db.prepare(
            `INSERT INTO notes (id, problem_id, tag_type, text, line_number) VALUES (?, ?, ?, ?, ?)`,
          );
          for (const tag of tags) {
            insertNote.run(randomUUID(), problemId, tag.tag, tag.text, tag.line);
          }
          db.exec("COMMIT");
          return problemId;
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
      });
    } catch (err) {
      // On a read-only filesystem (e.g. Vercel, until the Postgres swap in
      // DEPLOYMENT.md is done) this write will fail. The flowchart/complexity/
      // notes results are still valid and useful, so we return them anyway
      // and surface the save failure as a warning rather than a 500.
      savedProblemId = null;
      saveWarning = `Analysis succeeded but could not be saved to the log: ${redactSecrets((err as Error).message)}`;
    }
  }

  return NextResponse.json({
    results,
    callGraph,
    callGraphLight,
    callGraphTooltips,
    savedProblemId,
    saveWarning,
  });
}
