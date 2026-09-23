import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Monaco is self-bundled (loader.config in CodeEditor) with same-origin blob
// workers; Next.js dev tooling needs inline/eval scripts. In production the
// eval allowance and third-party CDN entries are dropped entirely — inline
// stays for the theme-bootstrap script in the layout.
const isProd = process.env.NODE_ENV === "production";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval' https://cdn.jsdelivr.net"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com",
  "font-src 'self' data:",
  `connect-src 'self'${isProd ? "" : " https://cdn.jsdelivr.net"}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // HTTPS-only for prod domains (Vercel adds its own; harmless duplicate,
  // self-hosted deployments get it from here).
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // Isolates the window from cross-origin openers (OAuth popup hardening).
  // X-XSS-Protection is explicitly disabled: the legacy auditor is itself
  // exploitable; modern browsers ignore it, older ones are safer without it.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "X-XSS-Protection": "0",
};

export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = {
  // Apply to pages and API routes, skip static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|woff2?)$).*)"],
};
