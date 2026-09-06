// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withDb } from "./init";

// The stale-stream self-heal contract: withDb() runs the operation against
// the shared handle; when the handle throws a dead-connection error (Turso's
// Hrana "stream not found" eviction), the connection is re-established once
// and the op retried; any other error propagates untouched.

describe("withDb", () => {
  it("runs operations against a healthy connection", () => {
    const result = withDb((db) => {
      db.exec("CREATE TABLE IF NOT EXISTS heal_probe (x INTEGER)");
      db.prepare("INSERT INTO heal_probe VALUES (42)").run();
      return db.prepare("SELECT x FROM heal_probe").get() as { x: number };
    });
    expect(result.x).toBe(42);
  });

  it("propagates non-connection errors untouched", () => {
    expect(() =>
      withDb(() => {
        throw new Error("syntax error near 'SELEC'");
      }),
    ).toThrow(/syntax error/);
    expect(() =>
      withDb(() => {
        throw new Error("UNIQUE constraint failed: users.github_id");
      }),
    ).toThrow(/UNIQUE constraint/);
  });

  it("recognizes the production Hrana eviction message and retries to success", () => {
    // Exact shape observed in production logs:
    // Hrana(Api("status=404 Not Found, body={"error":"stream not found: 25196a1c:12d2623"}"))
    const stale = new Error(
      'Hrana(Api("status=404 Not Found, body={\\"error\\":\\"stream not found: 25196a1c:12d2623\\"}"))',
    );
    // A fixture op that only throws the stale-stream error ONCE then
    // succeeds proves the reconnect + retry happened.
    let attempts = 0;
    const result = withDb((db) => {
      attempts += 1;
      if (attempts === 1) throw stale;
      return { recovered: true, dbOpen: db !== null };
    });
    expect(attempts).toBe(2);
    expect(result.recovered).toBe(true);
  });
});
