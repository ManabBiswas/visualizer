# CodeLens

CodeLens is a Java DSA analysis and revision tool for interview preparation. Paste a Java solution, inspect its structure as a color-coded flowchart, get complexity estimates with plain-English reasoning, extract revision notes from your own comments, and build a searchable log of solved problems — privately, under your own account.

## What it does

- Analyzes Java source code with an in-process TypeScript parser (java-parser); JVM CLI kept as an opt-in cross-check
- **Try a sample**: five curated problems (binary search, two sum, merge sort, BFS islands, valid parentheses) with rich tagged comments — one click loads and analyzes, deep-linkable via `/analyze?sample=two-sum`
- **LeetCode URL import**: paste a `leetcode.com/problems/…` link and the metadata bar auto-fills the name, difficulty and topic tags (unofficial GraphQL, host-allowlisted SSRF guard, graceful fallback to manual entry)
- **Multi-user with GitHub sign-in** (Auth.js v5): each account gets a private problem log, quiz deck, and notes — enforced at every API route, not just hidden in the UI
- Saves problems to **Turso** (libSQL) in the cloud, or a local SQLite file in dev — same schema, same code path
- Renders **multi-color flowcharts** — loops, decisions, calls, recursion, and returns each get their own color, with actual code (conditions, statements, call args) in the node labels and a built-in color legend. Diagrams open in a **pan/zoom viewer**: drag to pan, scroll or pinch to zoom, Fit/100% buttons, native size by default — plus hover tooltips with full node text, hover glow, and a bidirectional cursor↔flowchart highlight (move the editor caret and the matching node pulses)
- **Blocks walkthrough**: the method as readable per-section block cards — one card per statement with type badges, loop-bound hints, recursion flags, nested indentation, and jump-to-line — for understanding the structure without reading the graph
- Shows your **tagged comments inside the flowchart** as note nodes attached to the code they annotate (`// q:`, `// note:`, `// why:`, `// complexity:` — standalone or trailing after code)
- **Run console**: execute your code with real console input — type stdin (what your `Scanner` / `BufferedReader` reads), hit Run (or Ctrl+Enter), and see stdout/stderr, exit code and timing. Compiles and runs in an isolated temp directory with hard timeouts, output caps, JVM heap limits, rate limiting and a concurrency guard. **Local-only feature** — gated behind `NEXT_PUBLIC_ENABLE_RUN=1` because serverless hosts have no JVM; the endpoint itself returns 501 on deployments built without the flag
- Estimates time/space complexity with confidence scores and reasoning — detects nested loops, linear/halving/branching recursion (log n, n log n, 2^n), iterative binary search, sorting calls, and auxiliary allocations
- **Self-check mode**: guess both time **and** space complexity before revealing the estimates, with per-dimension right/wrong scoring
- **Call graph** for multi-method problems (e.g. DFS with a helper): internal methods and library calls as a navigable graph with per-node complexity badges (`O(n log n)` etc.) and signature/complexity tooltips — click a method to jump to its flowchart
- **Diff mode**: paste your brute-force and optimized solutions side by side, get a color-coded complexity delta (`O(n²) → O(n) improved`) with reasoning for both, plus both flowcharts with click-to-line navigation
- **Quiz mode with spaced repetition**: every `// q:` tag becomes a flashcard; reveal with spacebar, grade Again/Good/Easy (SM-2 scheduling), edit and save answers, filter by topic or due date
- **Focus sessions**: one click drills up to 10 cards from your weakest topics — topics ranked by average ease factor (never-reviewed first), interleaved round-robin so one big topic can't monopolize the session
- **Mistake journal**: cards graded "again" 3+ times stay flagged with a red `lapsed N×` badge and get their own All | Due | Mistakes view — review what you keep failing, not what you know
- **Progress dashboard** `/progress`: due-today count, per-topic mastery (average ease factor with weakest markers), a 30-day activity heatmap (saves + reviews), and a day streak
- **Public share links** `/p/{slug}`: opt-in per problem — a 12-char unguessable slug renders a read-only analysis page (name, tags, per-method Big-O, source, revision notes) with `noindex`; revoke from the log and the page 404s immediately
- **Anki export**: download the current quiz view as a tab-separated `.txt` for Anki's basic import
- **Downloads**: flowchart as PNG or SVG, problem log as Markdown or CSV, single analysis as PDF
- Saves problems to your account's log; re-analyzing the same problem updates it instead of duplicating it
- `/log` view: filter by topic/difficulty, click a row to reopen the problem in the editor, share or revoke per row
- Supports multiple topic tags per problem from a fixed DSA taxonomy

## Stack

- Next.js 16 + TypeScript + React 19
- Monaco editor for Java input
- java-parser (TypeScript) for parsing; optional JavaParser CLI in `parser/`
- libSQL / Turso for the cloud database (SQLite locally in dev)
- Auth.js v5 (next-auth beta) with GitHub OAuth
- Mermaid for flowchart rendering
- Vitest for tests

## Prerequisites

- Node.js 18+
- npm
- Java JDK 17+ on `PATH` — only for the opt-in run console and JVM parser cross-check, not for analysis
- The JavaParser 3.26.2 jar in your local Maven cache (`~/.m2/repository/com/github/javaparser/javaparser-core/3.26.2/`) or pointed to via `JAVAPARSER_JAR` — only for the JVM cross-check

## Environment variables

Copy `.env.example` to `.env.local` (dev) or set them in your host's dashboard (prod):

| Variable | Required | Purpose |
|---|---|---|
| `TURSO_DATABASE_URL` | prod | `libsql://…` URL of your Turso database. In dev, omit it to fall back to a local `codelens.db` file |
| `TURSO_AUTH_TOKEN` | prod | Turso DB token (from `turso db tokens create`) |
| `AUTH_SECRET` | yes | Session-signing key. Generate with `openssl rand -base64 32` |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | yes | GitHub OAuth app credentials (see below) |
| `NEXT_PUBLIC_ENABLE_RUN` | no | Set to `1` to enable the run console. Requires a local JDK; leave unset on serverless |

**GitHub OAuth app**: create one at <https://github.com/settings/developers> (or a GitHub App) with callback URL `https://YOUR_DOMAIN/api/auth/callback/github` (plus `http://localhost:3000/api/auth/callback/github` for dev). The app must request **read-only** access to public data — CodeLens only needs the user's id, login, name, and avatar.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:3000, paste Java code, and click Analyze.

## Useful scripts

```bash
npm run dev           # compiles the Java parser, then starts Next.js
npm run build         # production build
npm start             # serve the production build
npm test              # run the Vitest suite (unit + parser integration)
npm run typecheck     # tsc --noEmit
npm run lint          # eslint (flat config)
```

## Project layout

```text
app/                  Next.js routes and pages
  api/analyze/        analysis endpoint (parser -> IR -> analysis -> user-scoped upsert)
  api/auth/           Auth.js handlers (GitHub sign-in)
  api/leetcode/       LeetCode URL -> problem metadata import (unofficial GraphQL)
  api/problems/       log listing + single-problem retrieval (owner-scoped)
  api/problems/[id]/share/  share-slug create (POST) / revoke (DELETE), owner-gated
  api/progress/       progress-dashboard stats (owner-scoped)
  api/quiz/           quiz cards + spaced-repetition review (owner-scoped)
  api/notes/          quiz answer editing (owner-scoped)
  api/run/            compile + execute Java with stdin input (auth + feature-flag gated)
  p/[slug]/           public read-only shared-analysis page (capability URL)
  analyze/            editor + analysis UI
  diff/               brute-force vs optimized comparison page
  log/                problem log page with filters, exports, share management
  progress/           progress dashboard page
  quiz/               spaced-repetition quiz page
components/           UI panels (editor chrome, flowchart, call graph, complexity, notes, sample picker, sign-in prompts)
data/                 curated sample problems for the Try-a-sample picker
lib/
  parser/             TypeScript Java parser (primary) + JVM runner (fallback)
  complexity/         complexity heuristics
  notes/              comment tag extraction
  flowchart/          IR -> Mermaid conversion (multi-color, comment notes, call graph)
  diff/               complexity delta comparison
  spaced/             SM-2 scheduler + weak-topic focus-session selection
  progress/           dashboard statistics (pure functions over card/problem rows)
  share/              share-slug generation + strict shape validation
  leetcode/           URL parsing + GraphQL response mapping (pure)
  export/             PNG/SVG/Markdown/CSV/Anki/PDF download helpers
  security/           input validation, sanitization, rate limiting, secret redaction
  auth.ts             Auth.js configuration (GitHub provider, JWT sessions)
  api/                request helpers (authed user resolution)
  db/                 libSQL/Turso setup + schema migrations + user upserts
parser/               Java parser project (JavaParser-based CLI)
scripts/              parser build script + dev session minting for tests
proxy.ts              CSP + security headers (Next.js 16 proxy convention, ex-middleware)
```

## How analysis works

1. User pastes Java code into the editor.
2. `POST /api/analyze` sends the source to the Java parser CLI.
3. The parser walks the AST and emits IR JSON (loops with conditions and bound classification, calls with receiver-qualified targets and args, returns with values).
4. TypeScript modules transform the IR into:
   - time/space complexity estimates with reasoning
   - note tags from comments (standalone and trailing)
   - a color-coded Mermaid flowchart with comment note nodes
5. Results are returned to the UI and stored in the database when a problem name is provided (upsert by name per user).

## Tagged comments

```java
// q: why use low + (high - low) / 2?     -> quiz/flashcard question
// note: mid stays inside the search range -> general note
// why: binary search halves the range     -> design rationale
// complexity: O(log n)                    -> your own complexity guess
int mid = low + (high - low) / 2; // trailing tags work too
```

Tags appear in the Notes panel, inside the flowchart as colored note nodes, and in the saved problem log.

## Security

Input is treated as hostile by default (`lib/security/`):

- **Injection**: all database access uses parameterized statements; problem links are restricted to `http(s)` URLs (blocks `javascript:` stored-XSS) both at write time and render time; path ids are format-validated; control characters are stripped from stored text
- **Secrets**: required env vars are asserted at boot; subprocesses (JVM parser / run console) inherit only an allowlisted env (PATH, HOME, JAVA_HOME — never tokens or secrets); error messages shown to clients are redacted against the secret registry
- **Multi-tenant**: every query is scoped by the authenticated user's id; foreign resources are indistinguishable from missing ones (404), and anonymous requests get 401 before any DB work
- **Parser abuse**: source is capped at 200k chars (2MB on the Java side), the JVM subprocess runs with a 15s kill timeout and an 8MB output cap, at most 4 parsers run concurrently, and pathological input (e.g. extreme nesting) is converted into a clean error instead of a JVM crash
- **Abuse**: `/api/analyze` is rate-limited per IP (30/min), `/api/leetcode` at 10/min with an 8s upstream timeout, and `/api/run` at 20/min; malformed JSON, oversized payloads, and invalid metadata get 400s before any work happens
- **Share links**: slugs are 12-char crypto-random base62 (~71 bits) stored with a partial unique index; the public page validates slug shape before SQL, leaks no user identity, is `noindex`, and revocation nulls the slug so the page 404s immediately — no public listing exists, so a slug is a pure capability URL
- **Headers**: the proxy sets a strict Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and `Cross-Origin-Opener-Policy`
- The parser is spawned with an argument array and `shell: false` — user code only ever reaches the JVM via stdin, never a shell

## Notes on the parser

Java parsing runs **in-process in TypeScript** via [java-parser](https://www.npmjs.com/package/java-parser) (`lib/parser/javaTs.ts`) — no JVM, no build step, works on serverless, ~200ms per analysis. The original JVM CLI (`parser/src/main/java/codelens/Main.java`, JavaParser-based) is kept as an opt-in cross-check: set `CODELENS_PARSER=java` (requires JDK 17 + `npm run prepare:parser`). A parity test suite verifies both engines produce identical complexity classifications, loop bounds and call targets.

The parser is heuristic-driven but covers common DSA patterns well: nested loops, enhanced for-loops, recursion hidden inside return statements and expressions, receiver-qualified library calls (`Arrays.sort`), and loop-bound classification (constant / parameter / input-dependent / unknown). Complexity results always carry a confidence badge and reasoning — they are estimates, not proofs.


## Status

Working product, deployed at <https://visualizer-cyan-tau.vercel.app>: analysis pipeline (in-process TS parser, no JVM required), multi-color flowcharts with embedded comment notes, tooltips, and cursor↔diagram sync, call graph with complexity badges, diff mode (brute force vs optimized), five curated samples with deep links, LeetCode URL import, spaced-repetition quiz with focus sessions, mistake journal and Anki export, progress dashboard (heatmap, streak, topic mastery), public share links, PNG/SVG/Markdown/CSV/PDF exports, time+space self-check scoring, multi-user GitHub auth with per-user data isolation, cloud Turso database, input-validation + secret-redaction security layer, and a full test suite (200 tests incl. TS/JVM parser parity).

v0.3 and v0.4 are shipped (share links, weak-topic drills, mistake journal). Remaining v0.4 backlog: GitHub journal sync, weekly email digest. See `docs/ROADMAP.md` (local) for the full plan.

---
Made by Manab.

---
