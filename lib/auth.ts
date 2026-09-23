import NextAuth from "next-auth";
import GitHub, { type GitHubProfile } from "next-auth/providers/github";
import { assertRequiredEnv } from "@/lib/security/env";

assertRequiredEnv();

// trustHost: pass `true`/`false` only when AUTH_TRUST_HOST is explicitly set;

const AUTH_TRUST_HOST = process.env.AUTH_TRUST_HOST
  ? process.env.AUTH_TRUST_HOST === "true"
  : undefined;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Narrow what the provider actually sends; the bundled Profile type keeps
// most fields as `unknown` so they cannot be trusted directly.
function asGitHubProfile(profile: unknown): GitHubProfile | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as GitHubProfile;
  if (typeof p.login !== "string" || p.id == null) return null;
  return p;
}

// Stateless JWT sessions: no session tables, ideal for serverless + Turso.
// The `users` row is upserted lazily by getOrCreateUser() when data is saved,
// keyed on the immutable GitHub id — never the login, which can be renamed.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt" },
  trustHost: AUTH_TRUST_HOST,
  // Secure cookie settings
  cookies: {
    sessionToken: {
      name: IS_PRODUCTION ? "__session" : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PRODUCTION,
        path: "/",
      },
    },
    callbackUrl: {
      name: IS_PRODUCTION ? "__callback" : "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PRODUCTION,
        path: "/",
      },
    },
    csrfToken: {
      name: IS_PRODUCTION ? "__csrf" : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: IS_PRODUCTION,
        path: "/",
      },
    },
  },
  callbacks: {
    // Persist profile fields the JWT needs for user upserts and the nav avatar.
    jwt({ token, profile }) {
      const p = asGitHubProfile(profile);
      if (p) {
        token.githubId = String(p.id);
        token.login = p.login;
        token.name = p.name ?? p.login;
        token.avatarUrl = typeof p.avatar_url === "string" ? p.avatar_url : undefined;
        token.email = typeof p.email === "string" ? p.email : token.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.githubId && token.login) {
        session.user.id = token.githubId;
        session.user.login = token.login;
        session.user.avatarUrl = token.avatarUrl;
      }
      return session;
    },
  },
});
