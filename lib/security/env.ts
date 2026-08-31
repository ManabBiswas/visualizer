// Central registry of required/secret environment variables.
//
// Goals:
// 1. Fail fast at boot with a clear operator-facing message instead of a
//    cryptic runtime error when a required variable is missing.
// 2. Keep a single list of what counts as a "secret" so other layers (run
//    sandbox, logs, error messages) can scrub or block them consistently.

export const REQUIRED_ENV = ["AUTH_SECRET"] as const;

export const SECRET_ENV_KEYS = [
  "AUTH_SECRET",
  "AUTH_GITHUB_ID",
  "AUTH_GITHUB_SECRET",
  "TURSO_AUTH_TOKEN",
  "TURSO_DATABASE_URL",
] as const;

/** Asserts required variables exist. Throws with the missing key names only. */
export function assertRequiredEnv(): void {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Set them in .env.local (dev) or the host's environment variables (prod).",
    );
  }
}

/**
 * Redacts anything that looks like a secret value from a message before it is
 * logged or returned to a client. Matches the exact values of known secret
 * env vars, not patterns — safer against false positives.
 */
export function redactSecrets(message: string): string {
  let redacted = message;
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length > 8) {
      redacted = redacted.split(value).join(`[${key}]`);
    }
  }
  return redacted;
}
