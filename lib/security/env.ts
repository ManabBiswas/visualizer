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

// Well-known BYO provider key shapes (AI quiz drafting keys the user
// pastes). redactSecrets scrubs these from any message as defense in
// depth — today's error mapping never echoes keys, but a future
// regression would leak less (audit Rev 5 follow-up).
const API_KEY_SHAPES: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g, // Anthropic (specific first — also matches sk-)
  /sk-[A-Za-z0-9_-]{20,}/g, // OpenAI (also matches sk-proj-…, sk-svcacct-…)
  /gsk_[A-Za-z0-9]{20,}/g, // Groq
  /AIza[A-Za-z0-9_-]{30,}/g, // Google/Gemini
  /glhf-[A-Za-z0-9]{20,}/g, // Together
  /r8_[A-Za-z0-9]{20,}/g, // Replicate
];

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

export function redactSecrets(message: string): string {
  let redacted = message;
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length > 8) {
      redacted = redacted.split(value).join(`[${key}]`);
    }
  }
  for (const shape of API_KEY_SHAPES) {
    redacted = redacted.replace(shape, "[redacted api key]");
  }
  return redacted;
}
