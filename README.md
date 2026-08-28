# CodeLens

CodeLens is a local-first Java DSA analysis and revision tool for interview preparation. Paste a Java solution, inspect its structure as a color-coded flowchart, get complexity estimates with plain-English reasoning, extract revision notes from your own comments, and build a searchable log of solved problems.

## What it does

- Analyzes Java source code with a JavaParser-based backend
- Renders **multi-color flowcharts** — loops, decisions, calls, recursion, and returns each get their own color, with actual code (conditions, statements, call args) in the node labels and a built-in color legend
- Shows your **tagged comments inside the flowchart** as note nodes attached to the code they annotate (`// q:`, `// note:`, `// why:`, `// complexity:` — standalone or trailing after code)
- Estimates time/space complexity with confidence scores and reasoning — detects nested loops, linear/halving/branching recursion (log n, n log n, 2^n), iterative binary search, sorting calls, and auxiliary allocations
- **Self-check mode**: guess the complexity before revealing the estimate, with right/wrong scoring
- **Call graph** for multi-method problems (e.g. DFS with a helper): internal methods and library calls as a navigable graph — click a method to jump to its flowchart
- **Diff mode**: paste your brute-force and optimized solutions side by side, get a color-coded complexity delta (`O(n²) → O(n) improved`) with reasoning for both, plus both flowcharts with click-to-line navigation
- **Quiz mode with spaced repetition**: every `// q:` tag becomes a flashcard; reveal with spacebar, grade Again/Good/Easy (SM-2 scheduling), edit and save answers, filter by topic or due date
- **Anki export**: download the current quiz view as a tab-separated `.txt` for Anki's basic import
- **Downloads**: flowchart as PNG or SVG, problem log as Markdown or CSV
- Saves problems to a local SQLite database; re-analyzing the same problem updates it instead of duplicating it
- `/log` view: filter by topic/difficulty, click a row to reopen the problem in the editor
- Supports multiple topic tags per problem from a fixed DSA taxonomy

## Stack

- Next.js 16 + TypeScript + React 19
- Monaco editor for Java input
- JavaParser CLI in `parser/`
- SQLite (better-sqlite3) for local problem tracking
- Mermaid for flowchart rendering
- Vitest for tests

## Prerequisites

- Node.js 18+
- Java JDK 17+ on `PATH`
- The JavaParser 3.26.2 jar in your local Maven cache (`~/.m2/repository/com/github/javaparser/javaparser-core/3.26.2/`) or pointed to via `JAVAPARSER_JAR`
- npm

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
  api/analyze/        analysis endpoint (parser -> IR -> analysis -> SQLite upsert)
  api/problems/       log listing + single-problem retrieval
  api/quiz/           quiz cards + spaced-repetition review
  api/notes/          quiz answer editing
  log/                problem log page with filters and exports
  quiz/               spaced-repetition quiz page
  diff/               brute-force vs optimized comparison page
components/           UI panels (editor chrome, flowchart, complexity, notes)
lib/
  complexity/         complexity heuristics
  notes/              comment tag extraction
  flowchart/          IR -> Mermaid conversion (multi-color, comment notes)
  diff/               complexity delta comparison
  spaced/             SM-2 spaced repetition scheduler
  export/             PNG/SVG/Markdown/CSV/Anki download helpers
  security/           input validation, sanitization, rate limiting
  db/                 SQLite setup
parser/               Java parser project (JavaParser-based CLI)
scripts/              parser build script
```

## How analysis works

1. User pastes Java code into the editor.
2. `POST /api/analyze` sends the source to the Java parser CLI.
3. The parser walks the AST and emits IR JSON (loops with conditions and bound classification, calls with receiver-qualified targets and args, returns with values).
4. TypeScript modules transform the IR into:
   - time/space complexity estimates with reasoning
   - note tags from comments (standalone and trailing)
   - a color-coded Mermaid flowchart with comment note nodes
5. Results are returned to the UI and stored in SQLite when a problem name is provided (upsert by name).

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

- **Injection**: all SQLite access uses parameterized statements; problem links are restricted to `http(s)` URLs (blocks `javascript:` stored-XSS) both at write time and render time; path ids are format-validated; control characters are stripped from stored text
- **Parser abuse**: source is capped at 200k chars (2MB on the Java side), the JVM subprocess runs with a 15s kill timeout and an 8MB output cap, at most 4 parsers run concurrently, and pathological input (e.g. extreme nesting) is converted into a clean error instead of a JVM crash
- **Abuse**: `/api/analyze` is rate-limited per IP (30/min); malformed JSON, oversized payloads, and invalid metadata get 400s before any work happens
- **Headers**: middleware sets a strict Content-Security-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Permissions-Policy`
- The parser is spawned with an argument array and `shell: false` — user code only ever reaches the JVM via stdin, never a shell

## Notes on the parser

The parser in `parser/src/main/java/codelens/Main.java` is heuristic-driven but covers common DSA patterns well: nested loops, enhanced for-loops, recursion hidden inside return statements and expressions, receiver-qualified library calls (`Arrays.sort`), and loop-bound classification (constant / parameter / input-dependent / unknown). Complexity results always carry a confidence badge and reasoning — they are estimates, not proofs.

## Status

Working local product: analysis pipeline, multi-color flowcharts with embedded comment notes, call graph, diff mode (brute force vs optimized), spaced-repetition quiz with Anki export, PNG/SVG/Markdown/CSV exports, self-check scoring, input-validation security layer, problem log with reopen, and a full test suite (74 tests). Next: the multi-user open-source platform (auth + cloud DB + hosted parsing).

---
Made by Manab.

---
