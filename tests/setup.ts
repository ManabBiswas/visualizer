// Vitest setup for route integration tests. Runs before any test module is
// collected. Node exposes AsyncLocalStorage as a global in CJS-land, but
// inlined ESM (see vitest.config.ts `server.deps.inline`) evaluates some
// next packages whose source checks `globalThis.AsyncLocalStorage` — this
// shim guarantees it is present before any next/auth module is imported.
import { AsyncLocalStorage } from "node:async_hooks";

if (!(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage) {
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
}

// TURSO_DATABASE_URL must never be set in test runs: routes would connect to
// the real cloud DB instead of the in-memory fixture. Same for the run
// console flag (tests assert the 501 branch).
delete process.env.TURSO_DATABASE_URL;
delete process.env.NEXT_PUBLIC_ENABLE_RUN;
