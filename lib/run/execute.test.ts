import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { runJava } from "./execute";

function hasJava(): boolean {
  try {
    execFileSync(process.platform === "win32" ? "java.exe" : "java", ["-version"], { stdio: "ignore" });
    execFileSync(process.platform === "win32" ? "javac.exe" : "javac", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!hasJava())("runJava (live JVM)", () => {
  it("runs a hello-world program", async () => {
    const result = await runJava(`public class Main { public static void main(String[] a) { System.out.println("hello"); } }`);
    expect(result.ok).toBe(true);
    expect(result.stage).toBe("run");
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
  }, 30_000);

  it("feeds stdin to a Scanner program", async () => {
    const src = `import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int sum = 0;
        for (int i = 0; i < n; i++) sum += sc.nextInt();
        System.out.println("sum=" + sum);
    }
}`;
    const result = await runJava(src, "3\n10 20 30\n");
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("sum=60");
  }, 30_000);

  it("feeds stdin to a BufferedReader program", async () => {
    const src = `import java.io.*;
public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        System.out.println("echo:" + line);
    }
}`;
    const result = await runJava(src, "code-lens\n");
    expect(result.ok).toBe(true);
    expect(result.stdout.trim()).toBe("echo:code-lens");
  }, 30_000);

  it("reports compile errors with stage=compile", async () => {
    const result = await runJava(`public class Main { public static void main(String[] a) { int x = ; } }`);
    expect(result.ok).toBe(false);
    expect(result.stage).toBe("compile");
    expect(result.stderr).toMatch(/error/);
  }, 30_000);

  it("reports a setup error when there is no main method", async () => {
    const result = await runJava(`class Solution { int f(int n) { return n; } }`);
    expect(result.ok).toBe(false);
    expect(result.stage).toBe("setup");
    expect(result.error).toMatch(/main/);
  });

  it("kills runaway programs at the time limit", async () => {
    const result = await runJava(
      `public class Main { public static void main(String[] a) { while (true) {} } }`,
      "",
      { runTimeoutMs: 2_000 },
    );
    expect(result.timedOut).toBe(true);
    expect(result.stderr).toContain("time limit");
  }, 30_000);

  it("captures runtime exceptions on stderr with a non-zero exit", async () => {
    const result = await runJava(
      `public class Main { public static void main(String[] a) { throw new RuntimeException("boom"); } }`,
    );
    expect(result.ok).toBe(false);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("boom");
  }, 30_000);
});
