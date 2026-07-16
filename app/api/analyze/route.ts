import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { ProgramIR } from "@/lib/ir";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { extractCommentTags, attachTagsToMethods } from "@/lib/notes/extract";
import { generateFlowchart } from "@/lib/flowchart/generate";
import { getDb } from "@/lib/db/init";

const PARSER_ROOT = path.join(process.cwd(), "parser");
const CLASSES_DIR = path.join(PARSER_ROOT, "target", "classes");
const PARSER_JAR = path.join(PARSER_ROOT, "target", "codelens-parser.jar");

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

    const child = spawn("java", args, {
      cwd: PARSER_ROOT,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Parser exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ProgramIR);
      } catch (e) {
        reject(
          new Error(`Failed to parse IR JSON from parser output: ${stdout}`),
        );
      }
    });

    child.stdin.write(source);
    child.stdin.end();
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { source, problem } = body as {
    source: string;
    problem?: {
      name: string;
      link?: string;
      topicTags?: string[];
      difficulty?: string;
    };
  };

  if (!source || typeof source !== "string") {
    return NextResponse.json(
      { error: "Missing `source` (Java code) in request body." },
      { status: 400 },
    );
  }

  let ir: ProgramIR;
  try {
    ir = await runParser(source);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to parse Java source: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  const sourceLines = source.split("\n");
  const tags = extractCommentTags(sourceLines);

  const results = ir.classes.flatMap((cls) =>
    attachTagsToMethods(cls.methods, tags).map((method) => ({
      className: cls.name,
      method,
      complexity: analyzeComplexity(method),
      flowchart: generateFlowchart(method),
    })),
  );

  let savedProblemId: string | null = null;
  if (problem?.name) {
    const db = getDb();
    savedProblemId = randomUUID();
    db.prepare(
      `INSERT INTO problems (id, name, link, topic_tags, difficulty, source_code) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      savedProblemId,
      problem.name,
      problem.link ?? null,
      JSON.stringify(problem.topicTags ?? []),
      problem.difficulty ?? null,
      source,
    );

    const primary = results[0];
    if (primary) {
      db.prepare(
        `INSERT INTO analyses (id, problem_id, time_complexity, space_complexity, time_confidence, space_confidence, ir_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        savedProblemId,
        primary.complexity.time.bigO,
        primary.complexity.space.bigO,
        primary.complexity.time.confidence,
        primary.complexity.space.confidence,
        JSON.stringify(ir),
      );
    }

    for (const tag of tags) {
      db.prepare(
        `INSERT INTO notes (id, problem_id, tag_type, text, line_number) VALUES (?, ?, ?, ?, ?)`,
      ).run(randomUUID(), savedProblemId, tag.tag, tag.text, tag.line);
    }
  }

  return NextResponse.json({ results, savedProblemId });
}
