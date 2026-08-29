import NextAuth from "next-auth";
import GitHub, { type GitHubProfile } from "next-auth/providers/github";

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
  // Auth.js v5 only auto-trusts *.vercel.app; localhost and custom domains
  // need this or every /api/auth/* call 500s with UntrustedHost.
  trustHost: true,
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
