import { afterEach, describe, expect, it } from "vitest";
import { assertRequiredEnv, redactSecrets, SECRET_ENV_KEYS } from "./env";

const ORIGINAL_ENV = { ...process.env };

function setSecret(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("assertRequiredEnv", () => {
  it("throws naming the missing keys only", () => {
    setSecret("AUTH_SECRET", undefined);
    expect(() => assertRequiredEnv()).toThrow(/AUTH_SECRET/);
  });

  it("passes when required keys exist", () => {
    setSecret("AUTH_SECRET", "test-secret-value");
    expect(() => assertRequiredEnv()).not.toThrow();
  });
});

describe("redactSecrets", () => {
  it("replaces exact secret values with their key name", () => {
    setSecret("AUTH_SECRET", "super-secret-abc123");
    setSecret("TURSO_AUTH_TOKEN", "eyJturso-token-xyz");
    const msg = "db failed with super-secret-abc123 and eyJturso-token-xyz";
    expect(redactSecrets(msg)).toBe("db failed with [AUTH_SECRET] and [TURSO_AUTH_TOKEN]");
  });

  it("leaves messages without secrets untouched", () => {
    setSecret("AUTH_SECRET", "super-secret-abc123");
    expect(redactSecrets("table problems has no column foo")).toBe(
      "table problems has no column foo",
    );
  });

  it("ignores unset secrets", () => {
    setSecret("AUTH_SECRET", undefined);
    expect(redactSecrets("literal AUTH_SECRET reference")).toBe("literal AUTH_SECRET reference");
  });

  it("never emits a value longer than the secret itself grew", () => {
    const value = "a-very-long-secret-value-0123456789";
    setSecret("AUTH_GITHUB_SECRET", value);
    const out = redactSecrets(`err ${value} tail`);
    expect(out).not.toContain(value);
    expect(out).toBe("err [AUTH_GITHUB_SECRET] tail");
  });
});

describe("SECRET_ENV_KEYS", () => {
  it("covers every secret the app handles", () => {
    expect(SECRET_ENV_KEYS).toContain("AUTH_SECRET");
    expect(SECRET_ENV_KEYS).toContain("AUTH_GITHUB_ID");
    expect(SECRET_ENV_KEYS).toContain("AUTH_GITHUB_SECRET");
    expect(SECRET_ENV_KEYS).toContain("TURSO_AUTH_TOKEN");
    expect(SECRET_ENV_KEYS).toContain("TURSO_DATABASE_URL");
  });
});
