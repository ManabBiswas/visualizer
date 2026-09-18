// TypeScript C++ parser built on web-tree-sitter (WASM — no native
// builds, runs on serverless). Emits the same ProgramIR contract as the
// Java/Python engines (lib/ir.ts), so every downstream module (complexity,
// flowchart, notes, call graph, diff) works unchanged.
//
// Grammar WASM files live in lib/parser/wasm/ and are committed — no
// network or native toolchain is needed at runtime or build time.

import { readFileSync } from "fs";
import { join } from "path";
import { Language, Parser } from "web-tree-sitter";
import { ProgramIR, ClassIR, MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";
import { classifyLoopBound } from "./javaTs";

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

function readWasm(name: string): Buffer {
  return readFileSync(join(process.cwd(), WASM_DIR, name));
}

async function ensureLanguage(): Promise<Language> {
  if (!langPromise) {
    langPromise = (async () => {
      await Parser.init({
        locateFile: () => join(process.cwd(), WASM_DIR, "web-tree-sitter.wasm"),
      });
      return Language.load(new Uint8Array(readWasm("tree-sitter-cpp.wasm")));
    })();
  }
  return langPromise;
}

export async function loadCppParser(): Promise<Parser> {
  const lang = await ensureLanguage();
  const p = new Parser();
  p.setLanguage(lang);
  return p;
}

const line = (n: TSNode): number => n.startPosition.row + 1;

const CPP_NON_IDENTIFIERS = new Set([
  "for", "while", "do", "if", "else", "switch", "case", "default",
  "try", "catch", "throw", "finally", "return", "break", "continue",
  "goto", "sizeof", "alignof", "decltype", "typeid", "noexcept",
  "constexpr", "static_assert", "thread_local", "inline", "virtual",
  "explicit", "friend", "template", "typename", "class", "struct",
  "enum", "union", "namespace", "using", "operator", "new", "delete",
  "this", "nullptr", "true", "false", "public", "private", "protected",
  "static", "const", "volatile", "const_cast", "static_cast", "dynamic_cast",
  "reinterpret_cast", "auto", "register", "extern", "mutable", "asm",
  "int", "char", "short", "long", "float", "double", "void", "bool",
  "signed", "unsigned", "wchar_t", "char16_t", "char32_t",
  "std", "cout", "cin", "endl", "vector", "string", "map", "set",
  "unordered_map", "unordered_set", "array", "list", "deque", "queue",
  "stack", "pair", "tuple", "make_pair", "make_tuple", "move", "forward",
  "unique_ptr", "shared_ptr", "weak_ptr", "make_unique", "make_shared",
  "begin", "end", "size", "empty", "push_back", "pop_back", "insert",
  "erase", "clear", "find", "count", "reserve", "capacity", "shrink_to_fit"
]);

function identifiersIn(text: string): string[] {
  const raw = text.match(/[A-Za-z_]\w*/g) ?? [];
  return [...new Set(raw.filter((id) => !CPP_NON_IDENTIFIERS.has(id) && !/^[A-Z_][A-Z0-9_]*$/.test(id)))];
}

function bareName(n: TSNode | null): string {
  return n && n.type === "identifier" ? n.text : "?";
}

function callNodes(calls: { target: string; args: string; line: number; isRecursive: boolean }[]): StatementNode[] {
  return calls.map((ci) => ({ type: "call" as const, line: ci.line, target: ci.target, args: ci.args, isRecursive: ci.isRecursive }));
}

type EmitCtx = { methodName: string; paramNames: string[] };

function callsIn(node: TSNode | null, ctx: EmitCtx): { target: string; args: string; line: number; isRecursive: boolean }[] {
  const out: { target: string; args: string; line: number; isRecursive: boolean }[] = [];
  const walk = (n: TSNode | null) => {
    if (!n) return;
    if (n.type === "call_expression") {
      const fn = n.childForFieldName("function");
      const argsNode = n.childForFieldName("arguments");
      if (fn) {
        const target = fn.text.replace(/\s+/g, "");
        const simpleName = target.split("::").pop() ?? target.split(".").pop() ?? target;
        out.push({
          target,
          args: argsNode ? argsNode.text.replace(/\s+/g, " ").replace(/^\(|\)$/g, "").trim() : "",
          line: line(n),
          isRecursive: simpleName === ctx.methodName,
        });
        if (argsNode) for (const c of argsNode.namedChildren) walk(c);
        return;
      }
    }
    for (const c of n.namedChildren) walk(c);
  };
  walk(node);
  return out;
}

function firstLine(text: string): string {
  return text.split("\n")[0].replace(/\s+/g, " ").trim();
}

function classifyCppLoopBound(condition: string, loopVarNames: string[], paramNames: string[]): LoopBoundType {
  const collapsed = condition.replace(/\s+/g, "");
  if (/^\d+$/.test(collapsed)) return "constant";
  if (/\.size\(\)|\.length\(\)|strlen\(/.test(collapsed)) return "input-dependent";
  if (loopVarNames.some(v => collapsed.includes(v)) && paramNames.some(p => collapsed.includes(p))) return "parameter";
  return "input-dependent";
}

function emitForStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const init = n.childForFieldName("initializer");
  const cond = n.childForFieldName("condition");
  const update = n.childForFieldName("update");
  const body = n.childForFieldName("body");
  const loopVars: string[] = [];
  if (init) {
    const decl = init.namedChildren.find(c => c.type === "declaration");
    if (decl) {
      for (const c of decl.namedChildren) {
        if (c.type === "init_declarator") {
          const nameNode = c.childForFieldName("declarator");
          if (nameNode?.type === "identifier") loopVars.push(nameNode.text);
        }
      }
    } else if (init.type === "expression_statement") {
      const expr = init.namedChildren[0];
      if (expr?.type === "assignment_expression") {
        const left = expr.childForFieldName("left");
        if (left?.type === "identifier") loopVars.push(left.text);
      }
    }
  }
  const condition = cond ? cond.text.replace(/\s+/g, " ").trim() : "";
  const boundType = classifyCppLoopBound(condition, loopVars, ctx.paramNames);
  const out: StatementNode[] = [];
  out.push(...callNodes(callsIn(init, ctx)));
  out.push(...callNodes(callsIn(cond, ctx)));
  out.push(...callNodes(callsIn(update, ctx)));
  out.push({
    type: "loop",
    kind: "for",
    line: line(n),
    endLine: n.endPosition.row + 1,
    boundType,
    condition: `${loopVars.join(", ") || "init"} ; ${condition} ; ${update ? update.text.replace(/\s+/g, " ").trim() : ""}`,
    body: body ? emitBlock(body, ctx) : [],
  });
  return out;
}

function emitWhileStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const cond = n.childForFieldName("condition");
  const body = n.childForFieldName("body");
  const condition = cond ? cond.text.replace(/\s+/g, " ").trim() : "";
  return [
    ...callNodes(callsIn(cond, ctx)),
    {
      type: "loop",
      kind: "while",
      line: line(n),
      endLine: n.endPosition.row + 1,
      boundType: classifyCppLoopBound(condition, [], ctx.paramNames),
      condition,
      body: body ? emitBlock(body, ctx) : [],
    },
  ];
}

function emitDoStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const cond = n.childForFieldName("condition");
  const body = n.childForFieldName("body");
  const condition = cond ? cond.text.replace(/\s+/g, " ").trim() : "";
  return [
    ...callNodes(callsIn(cond, ctx)),
    {
      type: "loop",
      kind: "do-while",
      line: line(n),
      endLine: n.endPosition.row + 1,
      boundType: classifyCppLoopBound(condition, [], ctx.paramNames),
      condition,
      body: body ? emitBlock(body, ctx) : [],
    },
  ];
}

function emitIfStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const cond = n.childForFieldName("condition");
  const consequence = n.childForFieldName("consequence");
  const alternative = n.childForFieldName("alternative");
  const branches: { condition?: string; isElse?: boolean; body: StatementNode[] }[] = [
    {
      condition: cond ? cond.text.replace(/\s+/g, " ").trim() : "",
      body: consequence ? emitBlock(consequence, ctx) : [],
    },
  ];
  if (alternative) {
    if (alternative.type === "if_statement") {
      const nested = emitIfStatement(alternative, ctx);
      for (const node of nested) {
        if (node.type === "if") {
          branches.push(...node.branches);
        }
      }
    } else {
      branches.push({ condition: "else", isElse: true, body: emitBlock(alternative, ctx) });
    }
  }
  return [...callNodes(callsIn(cond, ctx)), { type: "if", line: line(n), branches }];
}

function emitSwitchStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const cond = n.childForFieldName("condition");
  const body = n.childForFieldName("body");
  const cases: { label: string; body: StatementNode[] }[] = [];
  if (body) {
    for (const c of body.namedChildren) {
      if (c.type === "case_statement") {
        const val = c.childForFieldName("value");
        const caseBody = c.childForFieldName("body") ?? c;
        cases.push({
          label: val ? val.text.replace(/\s+/g, " ").trim() : "",
          body: emitBlock(caseBody, ctx),
        });
      } else if (c.type === "default_statement") {
        const caseBody = c.childForFieldName("body") ?? c;
        cases.push({ label: "default", body: emitBlock(caseBody, ctx) });
      }
    }
  }
  return [
    ...callNodes(callsIn(cond, ctx)),
    { type: "switch", line: line(n), cases },
  ];
}

function emitTryStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  const body = n.childForFieldName("body");
  const catches: { exceptionType: string; body: StatementNode[] }[] = [];
  let finallyBody: StatementNode[] | null = null;
  for (const c of n.namedChildren) {
    if (c.type === "catch_clause") {
      const param = c.childForFieldName("parameter");
      let exceptionType = "Exception";
      if (param) {
        const decl = param.namedChildren.find(x => x.type === "declaration");
        if (decl) {
          for (const d of decl.namedChildren) {
            if (d.type === "init_declarator") {
              const declarator = d.childForFieldName("declarator");
              if (declarator?.type === "identifier") exceptionType = declarator.text;
            }
          }
        }
      }
      const catchBody = c.childForFieldName("body");
      catches.push({ exceptionType, body: catchBody ? emitBlock(catchBody, ctx) : [] });
    } else if (c.type === "finally_clause") {
      const fb = c.childForFieldName("body");
      finallyBody = fb ? emitBlock(fb, ctx) : [];
    }
  }
  const tryBody = body ? emitBlock(body, ctx) : [];
  if (finallyBody) tryBody.push(...finallyBody);
  return [{ type: "try", line: line(n), body: tryBody, catches }];
}

function emitStatement(n: TSNode, ctx: EmitCtx): StatementNode[] {
  switch (n.type) {
    case "function_definition":
      return [{ type: "statement", line: line(n), text: firstLine(n.text) }];
    case "for_statement":
      return emitForStatement(n, ctx);
    case "while_statement":
      return emitWhileStatement(n, ctx);
    case "do_statement":
      return emitDoStatement(n, ctx);
    case "if_statement":
      return emitIfStatement(n, ctx);
    case "switch_statement":
      return emitSwitchStatement(n, ctx);
    case "try_statement":
      return emitTryStatement(n, ctx);
    case "return_statement": {
      const value = n.namedChildren.filter((c) => c.type !== "comment").map((c) => c.text).join(", ");
      return [...callNodes(callsIn(n, ctx)), { type: "return", line: line(n), value: value || undefined }];
    }
    case "compound_statement":
      return emitBlock(n, ctx);
    default: {
      const calls = callsIn(n, ctx);
      if (calls.length > 0) return [...callNodes(calls), { type: "statement", line: line(n), text: firstLine(n.text) }];
      return [{ type: "statement", line: line(n), text: firstLine(n.text) }];
    }
  }
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
  const declarator = def.childForFieldName("declarator");
  const name = declarator
    ? (declarator.type === "function_declarator"
        ? bareName(declarator.childForFieldName("declarator"))
        : bareName(declarator))
    : "?";
  const paramsNode = declarator?.childForFieldName("parameters") ?? def.childForFieldName("parameters");
  const params: { name: string; type: string }[] = [];
  if (paramsNode) {
    for (const p of paramsNode.namedChildren) {
      if (p.type === "parameter_declaration") {
        const decl = p.childForFieldName("declarator");
        const typeNode = p.childForFieldName("type");
        const paramName = decl ? bareName(decl) : "?";
        const paramType = typeNode ? typeNode.text.replace(/\s+/g, " ").trim() : "";
        params.push({ name: paramName, type: paramType });
      }
    }
  }
  const paramNames = params.map((p) => p.name);
  const bodyNode = def.childForFieldName("body");
  const ctx: EmitCtx = { methodName: name, paramNames };
  const body = bodyNode ? emitBlock(bodyNode, ctx) : [];
  const calls = callsIn(def, ctx).map((ci) => ci.target);
  return {
    name,
    signature: `${name}(${params.map((p) => `${p.type} ${p.name}`.trim()).join(", ")})`,
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
      if (n.type === "function_definition" || n.type === "field_declaration") {
        for (const c of n.namedChildren) {
          if (c.type === "function_definition") methods.push(extractMethod(c));
        }
      } else if (n.type === "function_definition") {
        methods.push(extractMethod(n));
      }
    }
  }
  return { name, methods };
}

function stripPreprocessor(source: string): string {
  return source
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

function normalizeCpp(source: string): string {
  return source
    .replace(/\busing\s+namespace\s+[^;]+;/g, "")
    .replace(/\bstd::/g, "")
    .replace(/\bnullptr\b/g, "null")
    .replace(/\bbool\b/g, "boolean");
}

export async function parseCpp(source: string): Promise<ProgramIR> {
  const cleanSource = normalizeCpp(stripPreprocessor(source));
  const parser = await loadCppParser();
  const tree = parser.parse(cleanSource);
  if (!tree) throw new Error("C++ parse failed — the parser returned no tree.");
  const root = tree.rootNode as unknown as TSNode;
  if (root.hasError) {
    const err = findError(root);
    if (err) {
      throw new Error(
        `C++ syntax error at line ${err.startPosition.row + 1}, column ${err.startPosition.column + 1} — check for missing semicolons, unmatched braces, or invalid syntax near that spot.`,
      );
    }
    throw new Error("C++ syntax error — check for missing semicolons, unmatched braces, or invalid syntax.");
  }

  const classes: ClassIR[] = [];
  const topLevelDefs: MethodIR[] = [];
  for (const n of root.namedChildren) {
    if (n.type === "class_specifier" || n.type === "struct_specifier") {
      classes.push(extractClass(n));
    } else if (n.type === "function_definition") {
      topLevelDefs.push(extractMethod(n));
    }
  }
  if (topLevelDefs.length > 0) classes.push({ name: "module", methods: topLevelDefs });

  tree.delete();
  return { classes };
}

function findError(n: TSNode | null): TSNode | null {
  if (!n) return null;
  if (n.type === "ERROR" || n.isMissing) return n;
  for (let i = 0; i < n.childCount; i++) {
    const found = findError(n.child(i));
    if (found) return found;
  }
  return null;
}