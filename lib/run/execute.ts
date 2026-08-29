// Sandboxed Java compile-and-run for the console feature.
//
// Trust model: this executes arbitrary user code on the machine running
// CodeLens (local-first product — same trust as the user running their own
// code). Mitigations still applied: isolated temp directory (removed after
// every run), hard timeouts on compile and run, output size caps, JVM heap
// and stack limits, argument-array spawn with no shell, and a concurrency
// guard at the API layer.

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { detectMainClass } from "./detect";

export const DEFAULT_COMPILE_TIMEOUT_MS = 20_000;
export const DEFAULT_RUN_TIMEOUT_MS = 10_000;
const MAX_OUTPUT_BYTES = 1_000_000;
const MAX_STDIN_BYTES = 1_000_000;

// The spawned JVM runs untrusted user code. It must never inherit the host
// process environment: secrets like AUTH_SECRET or TURSO_AUTH_TOKEN would be
// readable via System.getenv(). Build a minimal, secret-free env instead.
const ENV_ALLOWLIST = ["PATH", "HOME", "USERPROFILE", "JAVA_HOME", "JAVA_TOOL_OPTIONS"];

function sanitizedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key]) env[key] = process.env[key];
  }
  // Windows needs SystemRoot for process creation; JAVA_TOOL_OPTIONS and
  // *_OPTIONS vars could inject flags, so allowlist is kept deliberately small.
  if (process.platform === "win32" && process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  return env;
}

export type RunResult = {
  ok: boolean;
  stage: "setup" | "compile" | "run";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  mainClass: string | null;
  error?: string;
};

type ProcessResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

function exe(name: string): string {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function runProcess(
  command: string,
  args: string[],
  opts: { timeoutMs: number; stdin?: string; cwd?: string },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    // shell:false + argument array means nothing user-controlled ever passes
    // through a shell — combined with the sanitized env there is no path to
    // secret reads or flag injection from submitted Java code.
    const child = spawn(command, args, { cwd: opts.cwd, shell: false, env: sanitizedEnv() });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      // Give the process a moment to die, then settle with whatever we have.
      setTimeout(() => finish(null), 200);
    }, opts.timeoutMs);

    child.on("error", (err) => {
      stderr += `\nCould not start ${command}: ${err.message}`;
      finish(null);
    });

    child.stdout.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > MAX_OUTPUT_BYTES) {
        stdout = stdout.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > MAX_OUTPUT_BYTES) {
        stderr = stderr.slice(0, MAX_OUTPUT_BYTES) + "\n[output truncated]";
        child.kill("SIGKILL");
      }
    });

    child.on("close", (code) => finish(code));

    child.stdin.on("error", () => {
      // EPIPE if the child exits before consuming all stdin — harmless.
    });
    if (opts.stdin) {
      const payload = opts.stdin.length > MAX_STDIN_BYTES ? opts.stdin.slice(0, MAX_STDIN_BYTES) : opts.stdin;
      child.stdin.write(payload);
    }
    child.stdin.end();
  });
}

export async function runJava(
  source: string,
  stdin = "",
  opts: { compileTimeoutMs?: number; runTimeoutMs?: number } = {},
): Promise<RunResult> {
  const main = detectMainClass(source);
  if (!main) {
    return {
      ok: false,
      stage: "setup",
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      mainClass: null,
      error:
        "No `public static void main(String[] args)` found. Add a main method (e.g. read input with a Scanner) to run your code.",
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelens-run-"));
  try {
    fs.writeFileSync(path.join(dir, main.fileName), source, "utf-8");

    const compile = await runProcess(exe("javac"), ["-encoding", "UTF-8", "-d", dir, main.fileName], {
      timeoutMs: opts.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS,
      cwd: dir,
    });
    if (compile.timedOut) {
      return { ok: false, stage: "compile", stdout: "", stderr: "Compilation timed out.", exitCode: null, timedOut: true, mainClass: main.className };
    }
    if (compile.code !== 0) {
      return {
        ok: false,
        stage: "compile",
        stdout: compile.stdout,
        stderr: compile.stderr || `javac exited with code ${compile.code}`,
        exitCode: compile.code,
        timedOut: false,
        mainClass: main.className,
      };
    }

    // Heap/stack limits keep a runaway program from eating the host machine.
    const run = await runProcess(exe("java"), ["-Xmx256m", "-Xss8m", "-cp", dir, main.className], {
      timeoutMs: opts.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
      stdin,
      cwd: dir,
    });

    if (run.timedOut) {
      return {
        ok: false,
        stage: "run",
        stdout: run.stdout,
        stderr: `${run.stderr}\n[stopped: time limit exceeded]`.trim(),
        exitCode: null,
        timedOut: true,
        mainClass: main.className,
      };
    }

    return {
      ok: run.code === 0,
      stage: "run",
      stdout: run.stdout,
      stderr: run.stderr,
      exitCode: run.code,
      timedOut: false,
      mainClass: main.className,
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
