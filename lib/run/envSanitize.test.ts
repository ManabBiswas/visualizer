import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { runJava } from "./execute";

// The sanitizer is module-private in execute.ts (deliberately — it should not
// be importable by app code), so we verify its effect end-to-end: a real JVM
// run of a program that dumps System.getenv() and asserts the secrets it
// searches for are absent. This mirrors the actual attack: untrusted Java
// calling System.getenv and printing what it finds.

const PROBE = `
import java.util.Map;
public class Main {
    public static void main(String[] args) {
        StringBuilder found = new StringBuilder();
        for (Map.Entry<String, String> e : System.getenv().entrySet()) {
            String k = e.getKey();
            if (k.contains("SECRET") || k.contains("TOKEN") || k.equals("AUTH_GITHUB_ID")) {
                found.append(k).append("=");
            }
        }
        System.out.println(found.length() == 0 ? "CLEAN" : "LEAK:" + found);
    }
}`;

describe("run env sanitization (live JVM)", () => {
  it(
    "does not leak secret env vars to the executed Java program",
    { timeout: 30_000 },
    async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codelens-envtest-"));
      try {
        // Poison this process's env the way a compromised deployment would
        // have secrets present; runProcess must strip them before spawning.
        process.env.AUTH_SECRET = "poisoned-secret-value";
        process.env.TURSO_AUTH_TOKEN = "poisoned-token-value";
        process.env.AUTH_GITHUB_ID = "poisoned-client-id";

        const result = await runJava(PROBE, "");
        expect(result.ok).toBe(true);
        expect(result.stdout.trim()).toBe("CLEAN");
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
