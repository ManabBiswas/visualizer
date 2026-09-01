import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Monaco is loaded from jsDelivr by @monaco-editor/react and needs blob: workers;
// Next.js dev tooling needs inline/eval scripts. Everything else is locked to 'self'.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Isolates the window from cross-origin openers (OAuth popup hardening).
  // X-XSS-Protection is explicitly disabled: the legacy auditor is itself
  // exploitable; modern browsers ignore it, older ones are safer without it.
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.headers.set("X-XSS-Protection", "0");
  return res;
}

export const config = {
  // Apply to pages and API routes, skip static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|woff2?)$).*)"],
};
