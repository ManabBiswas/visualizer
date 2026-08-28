import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { ProgramIR } from "@/lib/ir";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { extractCommentTags, attachTagsToMethods } from "@/lib/notes/extract";
import { generateFlowchart } from "@/lib/flowchart/generate";
import { generateCallGraph } from "@/lib/flowchart/callGraph";
import { getDb } from "@/lib/db/init";
import { validateSource, validateProblemMeta } from "@/lib/security/validate";
import { isRateLimited, tryAcquireParserSlot, releaseParserSlot } from "@/lib/security/rateLimit";

const PARSER_ROOT = path.join(process.cwd(), "parser");
const CLASSES_DIR = path.join(PARSER_ROOT, "target", "classes");
const PARSER_JAR = path.join(PARSER_ROOT, "target", "codelens-parser.jar");

// Hard resource bounds for the parser subprocess.
const PARSER_TIMEOUT_MS = 15_000;
const MAX_IR_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_CONCURRENT_PARSERS = 4;
const RATE_LIMIT_PER_MINUTE = 30;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip") ?? "local";
}

function runParser(source: string): Promise<ProgramIR> {
  return new Promise((resolve, reject) => {
    const javaParserJar = process.env.JAVAPARSER_JAR
      ? path.resolve(process.env.JAVAPARSER_JAR)
      : path.join(
          process.env.HOME ?? process.env.USERPROFILE ?? "",
          ".m2",
          "repository",
          "com",
          "github",
          "javaparser",
          "javaparser-core",
          "3.26.2",
          "javaparser-core-3.26.2.jar",
        );

    const hasClasses = fs.existsSync(CLASSES_DIR);
    const hasJar = fs.existsSync(PARSER_JAR);

    if (!hasClasses && !hasJar) {
      reject(new Error("Parser is not built yet. Run npm run prepare:parser first."));
      return;
    }

    const args = hasJar
      ? ["-jar", PARSER_JAR]
      : ["-cp", `${CLASSES_DIR}${path.delimiter}${javaParserJar}`, "codelens.Main"];

    // Argument array + no shell: user source can never reach a shell interpreter.
    // Source is passed via stdin only, never as an argument.
    const child = spawn("java", args, {
      cwd: PARSER_ROOT,
      shell: false,
    });

    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const succeed = (ir: ProgramIR) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ir);
    };

    // Pathological input (e.g. extremely deep nesting) can hang or thrash the
    // JVM — kill it hard after the timeout.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`Analysis timed out after ${PARSER_TIMEOUT_MS / 1000}s.`));
    }, PARSER_TIMEOUT_MS);

    // Without this handler, a missing `java` binary (guaranteed on Vercel,
    // which has no JVM) emits an unhandled 'error' event that crashes the
    // whole serverless function instance instead of just this request.
    child.on("error", (err) => {
      fail(
        new Error(
          `Could not start the Java parser process (${err.message}). ` +
            `This usually means Java isn't available in this environment. ` +
            `See DEPLOYMENT.md if you're seeing this on a deployed instance.`,
        ),
      );
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      // Guard against IR output bombs from hostile input.
      if (stdout.length > MAX_IR_OUTPUT_BYTES) {
        child.kill("SIGKILL");
        fail(new Error("Parser output exceeded the size limit."));
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 64 * 1024) stderr = stderr.slice(0, 64 * 1024);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        fail(new Error(stderr || `Parser exited with code ${code}`));
        return;
      }
      try {
        succeed(JSON.parse(stdout) as ProgramIR);
      } catch {
        fail(new Error("Parser returned malformed output."));
      }
    });

    child.stdin.on("error", () => {
      // EPIPE if the child dies before consuming stdin — handled by close/timeout.
    });
    child.stdin.write(source);
    child.stdin.end();
  });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { source: rawSource, problem: rawProblem } = (body ?? {}) as {
    source?: unknown;
    problem?: unknown;
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

  if (isRateLimited(clientIp(req), RATE_LIMIT_PER_MINUTE, 60_000)) {
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
    ir = await runParser(sourceCheck.value);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse Java source: ${(err as Error).message}` },
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
      flowchart: generateFlowchart(method),
    })),
  );

  // Only present for multi-method problems; the UI hides the tab otherwise.
  const callGraph = generateCallGraph(ir);

  let savedProblemId: string | null = null;
  let saveWarning: string | null = null;
  if (problem) {
    try {
      const db = getDb();
      // Upsert by problem name: re-analyzing the same problem refreshes the row
      // instead of duplicating it in the log.
      const existing = db
        .prepare("SELECT id FROM problems WHERE name = ?")
        .get(problem.name) as { id: string } | undefined;

      if (existing) {
        savedProblemId = existing.id;
        db.prepare(
          `UPDATE problems SET link = ?, topic_tags = ?, difficulty = ?, source_code = ?, created_at = datetime('now') WHERE id = ?`,
        ).run(
          problem.link,
          JSON.stringify(problem.topicTags),
          problem.difficulty,
          sourceCheck.value,
          savedProblemId,
        );
        db.prepare("DELETE FROM analyses WHERE problem_id = ?").run(savedProblemId);
        db.prepare("DELETE FROM notes WHERE problem_id = ?").run(savedProblemId);
      } else {
        savedProblemId = randomUUID();
        db.prepare(
          `INSERT INTO problems (id, name, link, topic_tags, difficulty, source_code) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          savedProblemId,
          problem.name,
          problem.link,
          JSON.stringify(problem.topicTags),
          problem.difficulty,
          sourceCheck.value,
        );
      }

      const insertAnalysis = db.prepare(
        `INSERT INTO analyses (id, problem_id, method_name, time_complexity, space_complexity, time_confidence, space_confidence, ir_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const result of results) {
        insertAnalysis.run(
          randomUUID(),
          savedProblemId,
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
        insertNote.run(randomUUID(), savedProblemId, tag.tag, tag.text, tag.line);
      }
    } catch (err) {
      // On a read-only filesystem (e.g. Vercel, until the Postgres swap in
      // DEPLOYMENT.md is done) this write will fail. The flowchart/complexity/
      // notes results are still valid and useful, so we return them anyway
      // and surface the save failure as a warning rather than a 500.
      savedProblemId = null;
      saveWarning = `Analysis succeeded but could not be saved to the log: ${(err as Error).message}`;
    }
  }

  return NextResponse.json({ results, callGraph, savedProblemId, saveWarning });
}
