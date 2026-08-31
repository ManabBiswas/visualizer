// Mints a valid Auth.js session cookie for an existing GitHub user row, for
// runtime ownership testing without driving a browser through real OAuth.
// Usage: node scripts/mint-test-session.mjs <githubId> <login>
import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)].map((s) => s.trim())),
);

const [, , githubId, login] = process.argv;
if (!githubId || !login) {
  console.error("usage: node scripts/mint-test-session.mjs <githubId> <login>");
  process.exit(1);
}

const token = await encode({
  token: { name: login, email: null, sub: githubId, githubId, login },
  secret: env.AUTH_SECRET,
  // Must match the cookie name Auth.js derives the encryption key from.
  salt: "authjs.session-token",
});

// npm start serves from http://localhost:3000; the cookie host-only flag and
// the authjs.csrf-token cookie name must match what the server expects.
console.log(token);
