# CodeLens

Local DSA placement-prep companion. See `PRD.md`, `ARCHITECTURE.md`, `DESIGN.md`, and `SETUP.md` for full planning docs.

## Quick start

```bash
# 1. Build the Java parser CLI
cd parser
mvn clean package
cd ..

# 2. Install and run the web app
npm install
npm run dev
```

Open http://localhost:3000, paste a Java solution, hit **Analyze**.

## What's implemented (M1 + M2 + M3 scaffolding)
- Monaco editor with a Java example pre-loaded
- `/api/analyze` → spawns the JavaParser-based CLI (`parser/`), builds the IR, runs:
  - `lib/complexity/analyze.ts` — heuristic time/space complexity with confidence + reasoning
  - `lib/notes/extract.ts` — `// q:` / `// note:` / `// why:` / `// complexity:` tag extraction
  - `lib/flowchart/generate.ts` — IR → Mermaid flowchart, with click-to-jump line sync
- Self-check-before-reveal complexity mode
- SQLite persistence (`codelens.db`, local file) when a problem name is filled in
- `/log` — filterable Problem Log table (topic, difficulty)
- `lib/diff/compare.ts` — complexity delta helper, ready to wire into a diff-mode UI (not yet built)

## Not yet built (see PRD.md milestones M4+)
- Quiz mode + Anki export over accumulated `// q:` tags
- Diff mode UI ("brute force vs optimized" two-editor view)
- Call graph for multi-method problems
- PNG export of the flowchart

## Notes on the Java parser
`parser/src/main/java/codelens/Main.java` uses JavaParser to walk the AST and emit
IR JSON on stdout. The loop-bound classifier (`classifyLoopBound`) is a simple
heuristic (regex over the loop's source text) — good enough for typical DSA code
(`for (int i = 0; i < arr.length; i++)`, `for (int i = 0; i < n; i++)`) but not a
full data-flow analysis. Expect to tighten it as you feed it real problems and
notice misclassifications.

--
Made by Manab
