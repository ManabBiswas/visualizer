// In-memory sliding-window rate limiter and concurrency guard for the analyze
// endpoint. Single-process by design (fine for local use and Vercel functions,
// where each instance gets its own budget); swap for a shared store (e.g. Redis)
// if the product ever needs global limits across multiple instances.

import Redis from "ioredis";

const buckets = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 10_000;

// Redis client (lazy-initialized) for distributed rate limiting.
// Enabled via REDIS_URL env var. If not set, falls back to in-memory.
let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    redis.on("error", () => {
      // Silent fail — fallback to in-memory
      redis = null;
    });
    return redis;
  } catch {
    return null;
  }
}

/**
 * Checks if a key is rate limited using either Redis (if configured) or in-memory.
 * @param key - Unique identifier for the rate limit bucket (e.g., "quiz:user123")
 * @param limit - Maximum requests allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param now - Current timestamp (for testing)
 * @returns true if rate limited, false otherwise
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): Promise<boolean> {
  const redisClient = getRedis();
  const cutoff = now - windowMs;
  const windowSec = Math.ceil(windowMs / 1000);

  if (redisClient) {
    // Redis sliding window using sorted set
    const redisKey = `ratelimit:${key}`;
    try {
      await redisClient.connect();
      const pipeline = redisClient.pipeline();
      // Remove expired entries
      pipeline.zremrangebyscore(redisKey, 0, cutoff);
      // Count current entries
      pipeline.zcard(redisKey);
      // Add current request
      pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);
      // Set TTL on the key
      pipeline.expire(redisKey, windowSec + 1);
      const results = await pipeline.exec();
      const count = results?.[1]?.[1] as number;
      return count >= limit;
    } catch {
      // Fallback to in-memory on Redis error
    }
  }

  // In-memory fallback
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

/**
 * Synchronous version for backward compatibility — uses in-memory only.
 * @deprecated Use async isRateLimited() instead
 */
export function isRateLimitedSync(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): boolean {
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
  if (redis) {
    redis.quit();
    redis = null;
  }
}