import { randomBytes } from "crypto";

export const SHARE_SLUG_LENGTH = 12;
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Generates a fresh share slug (crypto-random, 12-char base62). */
export function generateShareSlug(): string {
  const bytes = randomBytes(SHARE_SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SHARE_SLUG_LENGTH; i++) {
    out += BASE62[bytes[i] % BASE62.length];
  }
  return out;
}


export function isValidShareSlug(raw: unknown): raw is string {
  return (
    typeof raw === "string" &&
    raw.length === SHARE_SLUG_LENGTH &&
    /^[a-zA-Z0-9]+$/.test(raw)
  );
}
