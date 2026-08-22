# CodeLens

CodeLens is a local-first Java DSA analysis and revision tool for interview preparation. It helps you paste a Java solution, inspect its structure, estimate complexity, extract revision notes, and keep a log of solved problems.

## What it does

- Analyzes Java source code with a JavaParser-based backend
- Extracts method-level complexity estimates with confidence scores
- Builds Mermaid flowcharts from the parsed method IR
- Finds inline revision tags like:
  - `// q:`
  - `// note:`
  - `// why:`
  - `// complexity:`
- Saves problem metadata and analysis results to a local SQLite database
- Lets you review saved problems from the `/log` view

## Stack

- Next.js 16 + TypeScript + React
- Monaco editor for Java input
- JavaParser CLI in `parser/`
- SQLite for local problem tracking
- Mermaid for flowchart rendering

## Prerequisites

- Node.js 18+
- Java JDK installed and available on `PATH`
- npm

## Quick start

```bash
npm install
npm run dev
```

Then open:

- http://localhost:3000

Paste Java code into the editor and click Analyze.

## Useful scripts

```bash
# Prepares the Java parser jar/class files for the app
npm run prepare:parser

# Runs the Next.js app with parser prep automatically
npm run dev

# Produces a production build
npm run build

# Starts the built app
npm start

# Runs the SQLite DB UI
npm run db:studio
```

## Project layout

```text
app/                  Next.js routes and pages
  api/analyze/        analysis endpoint
  log/               log page
components/          UI panels and editor chrome
lib/                 complexity, notes, flowchart, db logic
  complexity/        complexity heuristics
  notes/            comment tag extraction
  flowchart/        IR to Mermaid conversion
  db/               SQLite setup
parser/              Java parser project built with Maven/JavaParser
scripts/             project prep scripts
```

## How analysis works

1. User pastes Java code into the editor.
2. `POST /api/analyze` sends the source to the Java parser.
3. The Java parser walks the AST and emits IR JSON.
4. TypeScript modules transform the IR into:
   - time/space complexity estimates
   - note tags from comments
   - flowchart diagrams
5. Results are returned to the UI and optionally stored in SQLite if a problem name is provided.

## Local database

When a problem name is filled in, the app records entries in a local SQLite file named `codelens.db` in the project root. This supports the `/log` page for filtering and reviewing prior analyses.

## Notes on the parser

The parser logic in `parser/src/main/java/codelens/Main.java` is intentionally lightweight and heuristic-driven. It is great for common DSA patterns such as array scans, binary search loops, and standard nested loops, but it is not a full symbolic analyzer. If you notice bad complexity classifications, the best next step is to improve loop-bound detection and method-level IR extraction using real examples from your problem set.

<!-- ## Documentation

See the planning and design docs in the `docs/` folder for architecture and roadmap context:

- `docs/ARCHITECTURE.md`
- `docs/GUIDE/ARCHITECTURE.md`
- `docs/GUIDE/DEPLOYMENT.md`
- `docs/GUIDE/DESIGN.md`
- `docs/GUIDE/PLAN.md`
- `docs/GUIDE/PRD.md`
- `docs/GUIDE/SETUP.md` -->

## Status

This project is a working local prototype focused on Java DSA learning and revision. It includes the main analysis workflow, parser integration, complexity breakdowns, flowchart generation, and local logging, while future features such as more advanced diffing and quiz exports can be added on top of this foundation.

---
Made by Manab.

---