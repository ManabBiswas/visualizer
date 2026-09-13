// TypeScript Python parser built on web-tree-sitter (WASM — no native
// builds, runs on serverless). Emits the same ProgramIR contract as the
// Java engines (lib/ir.ts), so every downstream module (complexity,
// flowchart, notes, call graph, diff) works unchanged.
//
// Grammar WASM files live in lib/parser/wasm/ and are committed — no
// network or native toolchain is needed at runtime or build time.

import { readFileSync } from "fs";
import { join } from "path";
import { Language, Parser } from "web-tree-sitter";
import { ProgramIR, ClassIR, MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";
import { classifyLoopBound } from "./javaTs";

// Situated type for tree-sitter nodes; the upstream types are structural
// and keep evolving between releases, so we keep a minimal local surface.
type TSNode = {
  type: string;
  text: string;
  hasError: boolean;
  isMissing: boolean;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  childCount: number;
  child(i: number): TSNode | null;
  childForFieldName(name: string): TSNode | null;
  namedChildren: TSNode[];
};

const WASM_DIR = "lib/parser/wasm";

let langPromise: Promise<Language> | null = null;

// Read a WASM file from disk. Absolute paths would break `next build`'s
// output tracing, so resolve from CWD (repo root in dev, bundle root in
// serverless — outputFileTracingIncludes ships the files next to the
// server code either way).
function readWasm(name: string): Buffer {
  return readFileSync(join(process.cwd(), WASM_DIR, name));
}

// One-time WASM init per process. The runtime binary and the Python
// grammar are both loaded from the committed copies under lib/parser/wasm/
// — no CDN, no native build.
async function ensureLanguage(): Promise<Language> {
  if (!langPromise) {
    langPromise = (async () => {
      await Parser.init({
        locateFile: () => join(process.cwd(), WASM_DIR, "web-tree-sitter.wasm"),
      });
      return Language.load(new Uint8Array(readWasm("tree-sitter-python.wasm")));
    })();
  }
  return langPromise;
}

export async function loadPythonParser(): Promise<Parser> {
  const lang = await ensureLanguage();
  const p = new Parser();
  p.setLanguage(lang);
  return p;
}

const line = (n: TSNode): number => n.startPosition.row + 1; // 1-indexed, like javaTs

// Keyword identifiers that must never count as loop vars / params in
// classifyLoopBound. Mirrors LOOP_KEYWORDS in javaTs.ts.
const NON_IDENTIFIERS = new Set([
  "range",
  "len",
  "print",
  "True",
  "False",
  "None",
  "self",
  "cls",
  "and",
  "or",
  "not",
  "in",
  "is",
  "for",
  "while",
  "if",
  "else",
  "elif",
  "try",
  "except",
  "finally",
  "with",
  "as",
  "def",
  "class",
  "return",
  "yield",
  "lambda",
  "global",
  "nonlocal",
  "pass",
  "break",
  "continue",
  "raise",
  "del",
  "assert",
  "import",
  "from",
  "int",
  "str",
  "float",
  "bool",
  "list",
  "dict",
  "set",
  "tuple",
]);

function identifiersIn(text: string): string[] {
  const raw = text.match(/[A-Za-z_]\w*/g) ?? [];
  return [...new Set(raw.filter((id) => !NON_IDENTIFIERS.has(id) && !/^[A-Z]/.test(id)))];
}

function bareName(n: TSNode | null): string {
  return n && n.type === "identifier" ? n.text : "?";
}

// Python's range(...) is the equivalent of Java's `for (i = 0; i < N; i++)`
// header — classify its argument, not the call shape.
function classifyRange(argText: string, loopVarNames: string[], paramNames: string[]): LoopBoundType {
  const collapsed = argText.replace(/\s+/g, "");
  // range(10) / range(2, 10) / range(0, n, 2) → a single numeric top arg set
  // means a fixed trip count.
  const args = collapsed.split(",").map((a) => a.trim());
  const numerals = args.filter((a) => /^\d+$/.test(a));
  if (numerals.length === args.length) return "constant";
  // A size probe of a container (len(a), len(a) - 1) is bounded by the
  // input, not by the parameter's value — same as Java's arr.length.
  if (/\blen\(/.test(collapsed)) return "input-dependent";
  if (args.some((a) => paramNames.includes(a) || identifiersIn(a).some((id) => paramNames.includes(id)))) {
    return "parameter";
  }
  return "input-dependent";
}

// Recursion into a bare statement: emit calls found in the statement's own
// expressions plus the statement node itself. Nested bodies are handled by
// their own emit functions during recursion.
type EmitCtx = { methodName: string; paramNames: string[] };

function callsIn(node: TSNode | null, ctx: EmitCtx): { target: string; args: string; line: number; isRecursive: boolean }[] {
  const out: { target: string; args: string; line: number; isRecursive: boolean }[] = [];
  const walk = (n: TSNode | null) => {
    if (!n) return;
    if (n.type === "call") {
      const fn = n.childForFieldName("function");
      const argsNode = n.childForFieldName("arguments");
      if (fn) {
        const target = fn.text.replace(/\s+/g, "");
        const simpleName = target.split(".").pop() ?? target;
        out.push({
          target,
          args: argsNode ? argsNode.text.replace(/\s+/g, " ").replace(/^\(|\)$/g, "").trim() : "",
          line: line(n),
          isRecursive: simpleName === ctx.methodName,
        });
        // descend into args for nested calls f(g(x))
        if (argsNode) for (const c of argsNode.namedChildren) walk(c);
        return;
      }
    }
    for (const c of n.namedChildren) walk(c);
  };
  walk(node);
  return out;
}

function callNodes(calls: { target: string; args: string; line: number; isRecursive: boolean }[]): StatementNode[] {
  return calls.map((ci) => ({ type: "call" as const, line: ci.line, target: ci.target, args: ci.args, isRecursive: ci.isRecursive }));
}

function emitForStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  // left: identifier | pattern_list ; right: iterable expression
  const left = n.childForFieldName("left");
  const right = n.childForFieldName("right");
  const body = n.childForFieldName("body");
  const vars = left
    ? (left.type === "pattern_list" ? left.namedChildren : [left])
        .filter((v) => v.type === "identifier")
        .map((v) => v.text)
    : [];

  const iterableText = right ? right.text.replace(/\s+/g, " ").trim() : "";
  const out: StatementNode[] = [];

  // range(...) gets precise classification; everything else (iterating a
  // collection) is input-dependent — the Java enhanced-for contract.
  let boundType: LoopBoundType = "input-dependent";
  let condition = `${vars.join(", ") || "item"} : ${iterableText}`;
  if (right && right.type === "call" && right.childForFieldName("function")?.text === "range") {
    const argNode = right.childForFieldName("arguments");
    const argText = argNode ? argNode.namedChildren.map((a) => a.text).join(", ").replace(/\s+/g, "") : "";
    boundType = classifyRange(argText, vars, ctx.paramNames);
    condition = `${vars.join(", ") || "item"} : range(${argText})`;
    // range(len(a)) / range(n - 1) etc. — calls/identifiers inside args
    // surface as call nodes too (e.g. a len() call).
    out.push(...callNodes(callsIn(argNode, ctx)));
  } else {
    out.push(...callNodes(callsIn(right, ctx)));
  }

  out.push({
    type: "loop",
    kind: "for",
    line: line(n),
    endLine: n.endPosition.row + 1,
    boundType,
    condition,
    body: body ? emitBlock(body, ctx) : [],
  });
  return out;
}

function emitWhileStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const cond = n.childForFieldName("condition");
  const body = n.childForFieldName("body");
  const condition = cond ? cond.text.replace(/\s+/g, " ").trim() : "";
  // Python while-loops have no header var declarations — same empty
  // loopVarNames contract as the Java engines.
  return [
    ...callNodes(callsIn(cond, ctx)),
    {
      type: "loop",
      kind: "while",
      line: line(n),
      endLine: n.endPosition.row + 1,
      boundType: classifyLoopBound(condition, [], ctx.paramNames),
      condition,
      body: body ? emitBlock(body, ctx) : [],
    },
  ];
}

function emitIfStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const cond = n.childForFieldName("condition");
  const consequence = n.childForFieldName("consequence");
  const branches: { condition?: string; isElse?: boolean; body: StatementNode[] }[] = [
    {
      condition: cond ? cond.text.replace(/\s+/g, " ").trim() : "",
      body: consequence ? emitBlock(consequence, ctx) : [],
    },
  ];
  // elif_clause / else_clause arrive as named siblings on the if node.
  for (const c of n.namedChildren) {
    if (c.type === "elif_clause") {
      const ec = c.childForFieldName("condition");
      const eb = c.childForFieldName("consequence");
      branches.push({
        condition: ec ? ec.text.replace(/\s+/g, " ").trim() : "",
        body: eb ? emitBlock(eb, ctx) : [],
      });
    } else if (c.type === "else_clause") {
      const eb = c.namedChildren.find((x) => x.type === "block");
      branches.push({ condition: "else", isElse: true, body: eb ? emitBlock(eb, ctx) : [] });
    }
  }
  return [...callNodes(callsIn(cond, ctx)), { type: "if", line: line(n), branches }];
}

function emitTryStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const body = n.namedChildren.find((x) => x.type === "block") ?? null;
  const catches: { exceptionType: string; body: StatementNode[] }[] = [];
  let elseBody: StatementNode[] | null = null;
  let finallyBody: StatementNode[] | null = null;
  for (const c of n.namedChildren) {
    if (c.type === "except_clause") {
      // except ValueError / except (A, B) as e / bare except — the type
      // rides in the `value` field (identifier, tuple, or as_pattern when
      // an alias is bound). Text form covers all three: strip parens,
      // spaces and any trailing "as alias".
      let exceptionType = "Exception";
      const value = c.childForFieldName("value");
      if (value) {
        const t = value.text.replace(/\s+as\s+\w+$/i, "").replace(/[()\s]/g, "");
        exceptionType = t || "Exception";
      }
      const eb = c.namedChildren.find((x) => x.type === "block");
      catches.push({ exceptionType, body: eb ? emitBlock(eb, ctx) : [] });
    } else if (c.type === "else_clause") {
      const eb = c.namedChildren.find((x) => x.type === "block");
      elseBody = eb ? emitBlock(eb, ctx) : [];
    } else if (c.type === "finally_clause") {
      const fb = c.namedChildren.find((x) => x.type === "block");
      finallyBody = fb ? emitBlock(fb, ctx) : [];
    }
  }
  const tryBody = body ? emitBlock(body, ctx) : [];
  if (elseBody) tryBody.push(...elseBody);
  if (finallyBody) tryBody.push(...finallyBody);
  return [{ type: "try", line: line(n), body: tryBody, catches }];
}

function emitStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  switch (n.type) {
    case "function_definition":
      // Nested def: kept as a plain statement — same as local class/method
      // handling in the Java engines (methods are only extracted at class level).
      return [{ type: "statement", line: line(n), text: n.text.split("\n")[0] }];
    case "for_statement":
      return emitForStatement(n, ctx);
    case "while_statement":
      return emitWhileStatement(n, ctx);
    case "if_statement":
      return emitIfStatement(n, ctx);
    case "try_statement":
      return emitTryStatement(n, ctx);
    case "with_statement":
      return [...callNodes(callsIn(n, ctx)), { type: "statement", line: line(n), text: firstLine(n.text) }];
    case "return_statement": {
      // A comprehension returned directly is still an implicit loop.
      const comp = findComprehension(n);
      if (comp) {
        const out = [...callNodes(callsIn(n, ctx))];
        out.push(...emitComprehension(comp, ctx));
        out.push({ type: "return", line: line(n), value: firstLine(n.text) });
        return out;
      }
      const value = n.namedChildren.filter((c) => c.type !== "comment").map((c) => c.text).join(", ");
      return [...callNodes(callsIn(n, ctx)), { type: "return", line: line(n), value: value || undefined }];
    }
    default: {
      // expression statements, assignments, assert, del, pass, etc.
      // Comprehensions in an assignment are still an implicit O(n) loop —
      // surface them as a loop node so complexity analysis sees them.
      const comp = findComprehension(n);
      if (comp) {
        const out = [...callNodes(callsIn(n, ctx))];
        out.push(...emitComprehension(comp, ctx));
        return out;
      }
      const calls = callsIn(n, ctx);
      if (calls.length > 0) return [...callNodes(calls), { type: "statement", line: line(n), text: firstLine(n.text) }];
      return [{ type: "statement", line: line(n), text: firstLine(n.text) }];
    }
  }
}

function firstLine(text: string): string {
  return text.split("\n")[0].replace(/\s+/g, " ").trim();
}

function findComprehension(n: TSNode | null): TSNode | null {
  if (!n) return null;
  if (
    n.type === "list_comprehension" ||
    n.type === "dictionary_comprehension" ||
    n.type === "set_comprehension" ||
    n.type === "generator_expression"
  ) {
    return n;
  }
  for (const c of n.namedChildren) {
    const found = findComprehension(c);
    if (found) return found;
  }
  return null;
}

function emitComprehension(n: TSNode, ctx: EmitCtx): StatementNode[] {
  // Each for_in_clause is one iteration level; if_clause adds a filter
  // (still the same iteration, not extra depth).
  const fors: { vars: string[]; iterable: TSNode | null }[] = [];
  for (const c of n.namedChildren) {
    if (c.type === "for_in_clause") {
      const left = c.childForFieldName("left");
      const right = c.childForFieldName("right");
      const vars = left
        ? (left.type === "pattern_list" ? left.namedChildren : [left])
            .filter((v) => v.type === "identifier")
            .map((v) => v.text)
        : [];
      fors.push({ vars, iterable: right });
    }
  }
  const out: StatementNode[] = [];
  let body: StatementNode[] = [];
  for (let i = fors.length - 1; i >= 0; i--) {
    const f = fors[i];
    const iterableText = f.iterable ? f.iterable.text.replace(/\s+/g, " ").trim() : "";
    let boundType: LoopBoundType = "input-dependent";
    if (f.iterable?.type === "call" && f.iterable.childForFieldName("function")?.text === "range") {
      const argNode = f.iterable.childForFieldName("arguments");
      const argText = argNode ? argNode.namedChildren.map((a) => a.text).join(", ").replace(/\s+/g, "") : "";
      boundType = classifyRange(argText, f.vars, ctx.paramNames);
    }
    body = [
      {
        type: "loop",
        kind: "for",
        line: line(f.iterable ?? n),
        endLine: n.endPosition.row + 1,
        boundType,
        condition: `${f.vars.join(", ") || "item"} : ${iterableText}`,
        body,
      },
    ];
  }
  out.push(...body);
  return out;
}

function emitBlock(block: TSNode | null, ctx: EmitCtx): StatementNode[] {
  const out: StatementNode[] = [];
  if (!block) return out;
  for (const n of block.namedChildren) {
    if (n.type === "comment") continue;
    out.push(...emitStatement(n, ctx));
  }
  return out;
}

function extractMethod(def: TSNode): MethodIR {
  const name = bareName(def.childForFieldName("name"));
  const paramsNode = def.childForFieldName("parameters");
  const params: { name: string; type: string }[] = [];
  if (paramsNode) {
    for (const p of paramsNode.namedChildren) {
      if (p.type === "identifier") params.push({ name: p.text, type: "" });
      else if (p.type === "default_parameter") {
        const pn = p.childForFieldName("name");
        params.push({ name: bareName(pn), type: "" });
      } else if (p.type === "typed_parameter") {
        const pn = p.namedChildren.find((c) => c.type === "identifier") ?? null;
        params.push({ name: bareName(pn), type: "" });
      } else if (p.type === "list_splat" || p.type === "dictionary_splat") {
        params.push({ name: "*args", type: "" });
      }
      // typed_default_parameter etc. fall through — a ? placeholder keeps
      // the param order stable for classifyLoopBound's paramNames.
    }
  }
  const paramNames = params.map((p) => p.name).filter((p) => p !== "self");
  const bodyNode = def.childForFieldName("body");
  const ctx: EmitCtx = { methodName: name, paramNames };
  const body = bodyNode ? emitBlock(bodyNode, ctx) : [];
  const calls = callsIn(def, ctx).map((ci) => ci.target);
  return {
    name,
    signature: `${name}(${params.map((p) => p.name).join(", ")})`,
    params,
    returnType: "",
    startLine: line(def),
    endLine: def.endPosition.row + 1,
    body,
    calls,
    comments: [],
  };
}

function extractClass(cls: TSNode): ClassIR {
  const name = bareName(cls.childForFieldName("name"));
  const body = cls.childForFieldName("body");
  const methods: MethodIR[] = [];
  if (body) {
    for (const n of body.namedChildren) {
      if (n.type === "function_definition") methods.push(extractMethod(n));
    }
  }
  return { name, methods };
}

export async function parsePython(source: string): Promise<ProgramIR> {
  const parser = await loadPythonParser();
  const tree = parser.parse(source);
  if (!tree) throw new Error("Python parse failed — the parser returned no tree.");
  const root = tree.rootNode as unknown as TSNode;
  if (root.hasError) {
    // tree-sitter is error-tolerant; walk for the first ERROR/MISSING node
    // to report a position like the Java engines do.
    const err = findError(root);
    if (err) {
      throw new Error(
        `Python syntax error at line ${err.startPosition.row + 1}, column ${err.startPosition.column + 1} — check indentation, a missing colon, or an unclosed bracket near that spot.`,
      );
    }
    throw new Error("Python syntax error — check indentation, a missing colon, or an unclosed bracket.");
  }

  const classes: ClassIR[] = [];
  const topLevelDefs: MethodIR[] = [];
  for (const n of root.namedChildren) {
    if (n.type === "class_definition") classes.push(extractClass(n));
    else if (n.type === "function_definition") topLevelDefs.push(extractMethod(n));
  }
  // Classless Python files (typical LeetCode-style) ride in a synthetic
  // "module" class — downstream consumers only flatten classes[].methods,
  // so this keeps the IR contract without touching them.
  if (topLevelDefs.length > 0) classes.push({ name: "module", methods: topLevelDefs });

  tree.delete();
  return { classes };
}

function findError(n: TSNode | null): TSNode | null {
  if (!n) return null;
  if (n.type === "ERROR" || n.isMissing) return n;
  // MISSING nodes are anonymous — walk ALL children, not just named ones.
  for (let i = 0; i < n.childCount; i++) {
    const found = findError(n.child(i));
    if (found) return found;
  }
  return null;
}
