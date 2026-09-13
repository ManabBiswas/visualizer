// Route integration harness: drives the real Next.js route handlers with the
// real Auth.js session machinery against a throwaway in-memory database.
//
// How it works:
// 1. `callRoute` wraps each handler invocation in the same three async-local
//    stores the Next server uses for app-route handlers (action, work-unit
//    "request", work) — via Next's own exported instances, so `headers()`
//    (and therefore `auth()`) reads cookies from our request. No auth mocks.
// 2. Session cookies are minted with the real `next-auth/jwt` `encode()`,
//    signed with the same AUTH_SECRET the real `auth()` decodes with.
// 3. The database is an in-memory libsql instance swapped in via
//    `__setDbForTests` (lib/db/init.ts), so routes run their real
//    `withDb` code paths without touching codelens.db or Turso.

import {
  workAsyncStorageInstance,
} from "next/dist/server/app-render/work-async-storage-instance";
import {
  workUnitAsyncStorageInstance,
} from "next/dist/server/app-render/work-unit-async-storage-instance";
import {
  actionAsyncStorageInstance,
} from "next/dist/server/app-render/action-async-storage-instance";
import { createWorkStore } from "next/dist/server/async-storage/work-store";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";
import { getImplicitTags } from "next/dist/server/lib/implicit-tags";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import type Database from "libsql";

// ---------------------------------------------------------------------------
// Env: must be set before any route/auth module is imported (they assert at
// module load).
// ---------------------------------------------------------------------------
process.env.AUTH_SECRET ??= "test-secret-0123456789abcdef0123456789abcdef";
process.env.AUTH_GITHUB_ID ??= "test-github-id";
process.env.AUTH_GITHUB_SECRET ??= "test-github-secret";
// Deterministic origin for createActionURL inside next-auth's auth(): without
// it, the session URL is derived from request headers (host/x-forwarded-proto)
// and can end up on a mismatched protocol/host, failing the cookie lookup.
process.env.AUTH_URL ??= "http://localhost:3000";
delete process.env.TURSO_DATABASE_URL; // never touch the real cloud DB
delete process.env.NEXT_PUBLIC_ENABLE_RUN;

export const TEST_AUTH_SECRET = process.env.AUTH_SECRET;

// ---------------------------------------------------------------------------
// DB swap: lib/db/init.ts exposes the test seam.
// ---------------------------------------------------------------------------
type DbForTests = {
  __setDbForTests(db: Database.Database | null): void;
};

let currentDb: Database.Database | null = null;

/** Fresh in-memory DB per test context, with the real migrate() applied. */
export async function createTestDb(): Promise<Database.Database> {
  const libsql = (await import("libsql")).default;
  const { migrate } = await import("@/lib/db/init");
  const db = new libsql(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

/**
 * Installs `db` as the process-wide getDb() target. Call once per test file
 * (vitest isolates files into separate workers, so this never leaks across
 * suites). Migrations are already applied by createTestDb.
 */
export async function useTestDb(db: Database.Database): Promise<void> {
  const init = (await import("@/lib/db/init")) as unknown as DbForTests;
  if (typeof init.__setDbForTests !== "function") {
    throw new Error("lib/db/init.ts does not expose __setDbForTests — add the seam");
  }
  init.__setDbForTests(db);
  currentDb = db;
}

export function currentTestDb(): Database.Database {
  if (!currentDb) throw new Error("useTestDb() must be called first");
  return currentDb;
}

// ---------------------------------------------------------------------------
// Session minting: `authjs.session-token` is the cookie name Auth.js derives
// the encryption key from for the non-secure dev cookie — exactly what the
// routes see over http in tests. Returns the RAW token value; callRoute's
// `cookies` map adds the `name=value` framing.
// ---------------------------------------------------------------------------
export async function mintSessionToken(user: {
  githubId: string;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
}): Promise<string> {
  return encode({
    token: {
      name: user.name ?? user.login,
      email: null,
      sub: user.githubId,
      githubId: user.githubId,
      login: user.login,
      avatarUrl: user.avatarUrl ?? undefined,
    },
    secret: TEST_AUTH_SECRET,
    salt: "authjs.session-token",
  });
}

/** Cookie map (name → raw token) for a test user, for callRoute's `cookies`. */
export async function sessionCookies(user: { githubId: string; login: string }): Promise<{
  "authjs.session-token": string;
}> {
  return { "authjs.session-token": await mintSessionToken(user) };
}

// ---------------------------------------------------------------------------
// Handler invocation: mirrors route-modules/app-route/module.js —
// actionAsyncStorage.run(actionStore) > workUnitAsyncStorage.run(requestStore)
// > workAsyncStorage.run(workStore) > handler(req, ctx).
// ---------------------------------------------------------------------------
type RouteContext = { params: Promise<any> };
// `never` params: any real handler signature (NextRequest, Request, ...) is
// assignable to this shape, so callers can pass route exports directly.
type Handler = (req: never, ctx: RouteContext) => Promise<Response>;

const MINIMAL_RENDER_OPTS = {
  supportsDynamicResponse: true,
  isDraftMode: false,
  isPossibleServerAction: false,
  incrementalCache: undefined,
  cacheLifeProfiles: undefined,
  experimental: {},
  staticPageGenerationTimeout: 60,
  fetchCache: undefined,
  cacheComponents: false,
  validationLevel: 0,
  reactLoadableManifest: {},
  waitUntil: undefined,
  onClose: undefined,
  onAfterTaskError: undefined,
} as never;

export async function callRoute(
  handler: Handler,
  path: string,
  init: RequestInit & { cookies?: Record<string, string>; params?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const url = new URL(path, "http://localhost:3000");
  const headers = new Headers(init.headers);
  if (init.cookies) {
    headers.set(
      "cookie",
      Object.entries(init.cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
    );
  }
  // Routes expect NextRequest (req.nextUrl, req.cookies, ...). Wrap the plain
  // Request so handler signatures and field accesses all work.
  const req = new NextRequest(url, {
    method: init.method,
    headers,
    body: init.body,
  });

  const actionStore = { isAppRoute: true, isAction: false };
  const implicitTags = await getImplicitTags("api/test", url.pathname, null);
  const requestStore = createRequestStoreForAPI(
    { headers: req.headers, method: req.method } as never,
    url,
    implicitTags,
    undefined,
    { previewModeId: "test", previewModeEncryptionKey: "x".repeat(32), previewModeSigningKey: "y".repeat(32) },
    undefined,
  );
  const workStore = createWorkStore({
    page: "api/test",
    renderOpts: MINIMAL_RENDER_OPTS,
    deploymentId: "",
    buildId: "test",
    previouslyRevalidatedTags: [],
  });

  const ctx: RouteContext = { params: Promise.resolve(init.params ?? {}) };
  const res = await actionAsyncStorageInstance.run(actionStore, () =>
    workUnitAsyncStorageInstance.run(requestStore, () =>
      workAsyncStorageInstance.run(workStore, () => (handler as (req: Request, ctx: RouteContext) => Promise<Response>)(req, ctx)),
    ),
  );
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }
  return { status: res.status, body, headers: res.headers };
}
