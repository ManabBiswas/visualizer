// JVM subprocess parser — the original engine, kept as an opt-in fallback
// (CODELENS_PARSER=java) for cross-checking the TypeScript parser.

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { ProgramIR } from "@/lib/ir";

const PARSER_ROOT = path.join(process.cwd(), "parser");
const CLASSES_DIR = path.join(PARSER_ROOT, "target", "classes");
const PARSER_JAR = path.join(PARSER_ROOT, "target", "codelens-parser.jar");

const PARSER_TIMEOUT_MS = 15_000;
const MAX_IR_OUTPUT_BYTES = 8 * 1024 * 1024;

export function runJavaParser(source: string): Promise<ProgramIR> {
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
      reject(new Error("Java parser is not built. Run npm run prepare:parser or use the default TS parser."));
      return;
    }

    const args = hasJar
      ? ["-jar", PARSER_JAR]
      : ["-cp", `${CLASSES_DIR}${path.delimiter}${javaParserJar}`, "codelens.Main"];

    // Argument array + no shell: user source can never reach a shell interpreter.
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

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      fail(new Error(`Analysis timed out after ${PARSER_TIMEOUT_MS / 1000}s.`));
    }, PARSER_TIMEOUT_MS);

    child.on("error", (err) => {
      fail(new Error(`Could not start the Java parser process (${err.message}).`));
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => {
      stdout += d.toString();
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
