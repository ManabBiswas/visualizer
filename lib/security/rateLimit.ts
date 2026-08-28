// In-memory sliding-window rate limiter and concurrency guard for the analyze
// endpoint. Single-process by design (fine for local use and Vercel functions,
// where each instance gets its own budget); swap for a shared store (e.g. KV)
// if the product ever needs global limits.

const buckets = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 10_000;

/**
 * Returns true when the key has exceeded `limit` calls within `windowMs`.
 * Records the call otherwise.
 */
export function isRateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const cutoff = now - windowMs;
  const hits = buckets.get(key) ?? [];
  while (hits.length > 0 && hits[0] <= cutoff) hits.shift();

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return true;
  }

  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, timestamps] of buckets) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= cutoff) {
        buckets.delete(k);
      }
    }
  }
  return false;
}

let activeParserProcesses = 0;

/** Prevents unbounded JVM spawns; callers must release() in a finally block. */
export function tryAcquireParserSlot(maxConcurrent: number): boolean {
  if (activeParserProcesses >= maxConcurrent) return false;
  activeParserProcesses += 1;
  return true;
}

export function releaseParserSlot(): void {
  activeParserProcesses = Math.max(0, activeParserProcesses - 1);
}

export function activeParserCount(): number {
  return activeParserProcesses;
}

let activeRunProcesses = 0;

/** Concurrency guard for the code-run feature (heavier than parsing). */
export function tryAcquireRunSlot(maxConcurrent: number): boolean {
  if (activeRunProcesses >= maxConcurrent) return false;
  activeRunProcesses += 1;
  return true;
}

export function releaseRunSlot(): void {
  activeRunProcesses = Math.max(0, activeRunProcesses - 1);
}

/** Test helper. */
export function resetSecurityState(): void {
  buckets.clear();
  activeParserProcesses = 0;
  activeRunProcesses = 0;
}
