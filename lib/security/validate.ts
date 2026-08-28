// Input validation and sanitization shared by API routes and the client.
// Defense-in-depth: SQLite access is parameterized (no SQL injection), React
// escapes rendered text (no stored XSS via text), so this layer focuses on
// bounds/shape validation, dangerous URL schemes, and control-character stripping.

export const MAX_SOURCE_CHARS = 200_000;
export const MAX_NAME_CHARS = 200;
export const MAX_LINK_CHARS = 2048;
export const MAX_TOPIC_TAGS = 10;
export const MAX_TOPIC_CHARS = 50;
export const MAX_QUERY_PARAM_CHARS = 50;
export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Removes ASCII control characters (keeps \n, \r, \t) that can break storage/rendering. */
export function stripControlChars(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

/**
 * Returns a normalized http(s) URL, or null for anything else.
 * Blocks javascript:, data:, vbscript:, file: etc. — the main stored-XSS
 * vector since problem links are rendered as <a href>.
 */
export function sanitizeUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = stripControlChars(raw).trim();
  if (!trimmed || trimmed.length > MAX_LINK_CHARS) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Client-side check for rendering saved links safely (defense in depth). */
export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  return typeof raw === "string" && sanitizeUrl(raw) !== null;
}

export function validateSource(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Missing `source` (Java code) in request body." };
  }
  if (raw.length > MAX_SOURCE_CHARS) {
    return { ok: false, error: `Source is too large (max ${MAX_SOURCE_CHARS} characters).` };
  }
  if (raw.includes("\u0000")) {
    return { ok: false, error: "Source contains invalid characters." };
  }
  return { ok: true, value: raw };
}

export type ProblemMetaInput = {
  name: string;
  link?: string | null;
  topicTags?: string[];
  difficulty?: string | null;
};

export type ProblemMetaClean = {
  name: string;
  link: string | null;
  topicTags: string[];
  difficulty: (typeof DIFFICULTIES)[number] | null;
};

/**
 * Validates and normalizes problem metadata before it touches the database.
 * Returns null (without error) when no metadata was provided — saving is optional.
 */
export function validateProblemMeta(raw: unknown): ValidationResult<ProblemMetaClean | null> {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "`problem` must be an object." };
  }
  const meta = raw as ProblemMetaInput;

  if (typeof meta.name !== "string") {
    return { ok: false, error: "`problem.name` must be a string." };
  }
  const name = stripControlChars(meta.name).trim();
  if (!name) return { ok: true, value: null };
  if (name.length > MAX_NAME_CHARS) {
    return { ok: false, error: `Problem name is too long (max ${MAX_NAME_CHARS} characters).` };
  }

  let link: string | null = null;
  if (meta.link !== undefined && meta.link !== null && String(meta.link).trim() !== "") {
    link = sanitizeUrl(meta.link);
    if (link === null) {
      return { ok: false, error: "`problem.link` must be a valid http(s) URL." };
    }
  }

  let topicTags: string[] = [];
  if (meta.topicTags !== undefined && meta.topicTags !== null) {
    if (!Array.isArray(meta.topicTags)) {
      return { ok: false, error: "`problem.topicTags` must be an array of strings." };
    }
    if (meta.topicTags.length > MAX_TOPIC_TAGS) {
      return { ok: false, error: `Too many topic tags (max ${MAX_TOPIC_TAGS}).` };
    }
    const seen = new Set<string>();
    for (const tag of meta.topicTags) {
      if (typeof tag !== "string") {
        return { ok: false, error: "`problem.topicTags` must be an array of strings." };
      }
      const clean = stripControlChars(tag).trim().slice(0, MAX_TOPIC_CHARS);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        topicTags.push(clean);
      }
    }
  }

  let difficulty: ProblemMetaClean["difficulty"] = null;
  if (meta.difficulty !== undefined && meta.difficulty !== null && String(meta.difficulty).trim() !== "") {
    const d = String(meta.difficulty).trim();
    if (!(DIFFICULTIES as readonly string[]).includes(d)) {
      return { ok: false, error: "`problem.difficulty` must be Easy, Medium, or Hard." };
    }
    difficulty = d as ProblemMetaClean["difficulty"];
  }

  return { ok: true, value: { name, link, topicTags, difficulty } };
}

/** Validates a path id (problem id) — letters, digits, dash, underscore only. */
export function isValidId(raw: string): boolean {
  return /^[\w-]{1,64}$/.test(raw);
}

/** Sanitizes a query param: bounded length, control chars stripped. */
export function cleanQueryParam(raw: string | null): string | null {
  if (!raw) return null;
  const clean = stripControlChars(raw).trim().slice(0, MAX_QUERY_PARAM_CHARS);
  return clean || null;
}
