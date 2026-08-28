// TypeScript Java parser built on java-parser (Chevrotain CST).
// Produces the exact same ProgramIR contract as the JVM CLI in parser/,
// so downstream modules (complexity, flowchart, notes) work unchanged.
// This is the primary parser — it removes the JVM dependency entirely.

import { parse } from "java-parser";
import { ProgramIR, ClassIR, MethodIR, StatementNode, LoopBoundType } from "@/lib/ir";

type Node = any; // java-parser's CST is structurally typed; kept loose on purpose
type Tok = { image: string; startOffset: number; endOffset: number; startLine: number; endLine: number };

function find(node: Node, name: string, out: Node[] = []): Node[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) find(n, name, out);
    return out;
  }
  if (node.name === name) out.push(node);
  if (node.children) for (const v of Object.values(node.children)) find(v, name, out);
  return out;
}

function tokensOf(node: Node, out: Tok[] = []): Tok[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const n of node) tokensOf(n, out);
    return out;
  }
  if (node.image !== undefined) {
    out.push(node);
    return out;
  }
  if (node.children) for (const v of Object.values(node.children)) tokensOf(v, out);
  return out;
}

function rangeOf(node: Node): { startLine: number; endLine: number; startOffset: number; endOffset: number } | null {
  const toks = tokensOf(node);
  if (toks.length === 0) return null;
  let startOffset = Infinity;
  let endOffset = -Infinity;
  let startLine = Infinity;
  let endLine = -Infinity;
  for (const t of toks) {
    if (t.startOffset < startOffset) startOffset = t.startOffset;
    if (t.endOffset > endOffset) endOffset = t.endOffset;
    if (t.startLine < startLine) startLine = t.startLine;
    if (t.endLine > endLine) endLine = t.endLine;
  }
  return { startLine, endLine, startOffset, endOffset };
}

// Exact source text for a CST node, whitespace-collapsed.
function textOf(node: Node, source: string): string {
  const range = rangeOf(node);
  if (!range) return "";
  return source.slice(range.startOffset, range.endOffset + 1).replace(/\s+/g, " ").trim();
}

const LOOP_KEYWORDS = new Set(["true", "false", "null", "new", "this", "super", "return", "instanceof"]);

// Same classification rules as the Java CLI so both engines agree.
export function classifyLoopBound(
  condition: string,
  loopVarNames: string[],
  paramNames: string[],
): LoopBoundType {
  if (!condition) return "unknown";
  const collapsed = condition.replace(/\s+/g, "");
  if (collapsed === "true") return "input-dependent";
  if (/\w\.length\b/.test(collapsed) || /\w\.size\(\)/.test(collapsed)) return "input-dependent";

  const identifiers = (collapsed.match(/[A-Za-z_]\w*/g) ?? []).filter((id) => !LOOP_KEYWORDS.has(id));
  if (identifiers.length > 0 && identifiers.every((id) => loopVarNames.includes(id)) && /\d/.test(collapsed)) {
    return "constant";
  }
  if (identifiers.some((id) => paramNames.includes(id))) return "parameter";
  if (identifiers.length > 0) return "input-dependent";
  if (/\d/.test(collapsed)) return "constant";
  return "unknown";
}

type CallInfo = { target: string; args: string; line: number; isRecursive: boolean };

// Extracts method calls from a `primary` node: the prefix gives the receiver
// chain (e.g. Arrays.sort, map.get) and each invocation suffix is one call.
// Chained calls like a.b().c(d) accumulate identifiers across suffixes.
function callsInPrimary(primary: Node, source: string, enclosingMethod: string): CallInfo[] {
  const children = primary.children ?? {};
  const suffixes: Node[] = children.primarySuffix ?? [];
  if (!suffixes.some((s) => s.children?.methodInvocationSuffix)) return [];

  const prefixText = textOf(children.primaryPrefix, source);
  const out: CallInfo[] = [];
  let current = prefixText;

  for (const suffix of suffixes) {
    const c = suffix.children ?? {};
    if (c.Identifier?.[0]) {
      current = current ? `${current}.${c.Identifier[0].image}` : c.Identifier[0].image;
    }
    if (c.methodInvocationSuffix?.[0]) {
      const inv = c.methodInvocationSuffix[0].children ?? {};
      const argList = inv.argumentList?.[0];
      const args = argList ? textOf(argList, source) : "";
      const line = rangeOf(suffix)?.startLine ?? 0;
      const simpleName = current.split(".").pop() ?? current;
      out.push({ target: current, args, line, isRecursive: simpleName === enclosingMethod });
    }
  }
  return out;
}

// All calls in a subtree. Used for the method-level `calls` array.
function collectCalls(node: Node, source: string, enclosingMethod: string): CallInfo[] {
  return find(node, "primary").flatMap((p) => callsInPrimary(p, source, enclosingMethod));
}

// Calls in a statement's own expressions only — never descends into nested
// statement bodies (those emit their own call nodes during recursion).
const STATEMENT_BOUNDARIES = new Set([
  "block",
  "ifStatement",
  "whileStatement",
  "doStatement",
  "forStatement",
  "switchBlockStatementGroup",
  "catchClause",
]);

function headerCalls(node: Node, source: string, enclosingMethod: string): CallInfo[] {
  const out: CallInfo[] = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const x of n) walk(x);
      return;
    }
    if (n.name && STATEMENT_BOUNDARIES.has(n.name)) return;
    if (n.name === "primary") {
      out.push(...callsInPrimary(n, source, enclosingMethod));
      // still descend into arguments so nested calls like f(g(x)) are found
    }
    if (n.children) for (const v of Object.values(n.children)) walk(v);
  };
  walk(node);
  return out;
}

function statementText(node: Node, source: string): string {
  return textOf(node, source);
}

function emitBlock(block: Node, source: string, methodName: string, paramNames: string[]): StatementNode[] {
  const blockStatements = block.children?.blockStatements?.[0]?.children?.blockStatement ?? [];
  const out: StatementNode[] = [];
  for (const bs of blockStatements) {
    if (bs.children?.statement?.[0]) {
      out.push(...emitStatement(bs.children.statement[0], source, methodName, paramNames));
    } else {
      // local variable / type declarations
      const range = rangeOf(bs);
      out.push({ type: "statement", line: range?.startLine ?? 0, text: textOf(bs, source) });
    }
  }
  return out;
}

function emitStatement(stmt: Node, source: string, methodName: string, paramNames: string[]): StatementNode[] {
  const c = stmt.children ?? {};
  const line = rangeOf(stmt)?.startLine ?? 0;

  if (c.statementWithoutTrailingSubstatement?.[0]) {
    const inner = c.statementWithoutTrailingSubstatement[0].children ?? {};

    if (inner.block?.[0]) {
      return emitBlock(inner.block[0], source, methodName, paramNames);
    }

    if (inner.expressionStatement?.[0]) {
      const exprStmt = inner.expressionStatement[0];
      const stmtExpr = exprStmt.children?.statementExpression?.[0];
      const exprRange = rangeOf(stmtExpr);
      // A bare call statement (e.g. `g(i);`) is a single primary whose range
      // exactly covers the statement expression — arguments contain their own
      // primaries, so range equality is the reliable check.
      const barePrimary = find(stmtExpr, "primary").find((p) => {
        const r = rangeOf(p);
        return (
          !!r &&
          !!exprRange &&
          r.startOffset === exprRange.startOffset &&
          r.endOffset === exprRange.endOffset &&
          (p.children?.primarySuffix ?? []).some((s: Node) => s.children?.methodInvocationSuffix)
        );
      });
      const bareCall = barePrimary ? callsInPrimary(barePrimary, source, methodName)[0] : undefined;
      if (bareCall) {
        return [
          {
            type: "call",
            line,
            target: bareCall.target,
            args: bareCall.args,
            isRecursive: bareCall.isRecursive,
          },
        ];
      }
      const calls = headerCalls(stmtExpr, source, methodName).map((ci) => ({
        type: "call" as const,
        line: ci.line,
        target: ci.target,
        args: ci.args,
        isRecursive: ci.isRecursive,
      }));
      return [...calls, { type: "statement", line, text: statementText(exprStmt, source) }];
    }

    if (inner.returnStatement?.[0]) {
      const ret = inner.returnStatement[0];
      const expr = ret.children?.expression?.[0];
      const calls = expr
        ? headerCalls(expr, source, methodName).map((ci) => ({
            type: "call" as const,
            line: ci.line,
            target: ci.target,
            args: ci.args,
            isRecursive: ci.isRecursive,
          }))
        : [];
      return [...calls, { type: "return", line, value: expr ? textOf(expr, source) : undefined }];
    }

    if (inner.switchStatement?.[0]) {
      const sw = inner.switchStatement[0];
      const expr = sw.children?.expression?.[0];
      const groups = find(sw.children?.switchBlock?.[0], "switchBlockStatementGroup");
      const cases = groups.map((g) => {
        const label = g.children?.switchLabel?.[0] ? textOf(g.children.switchLabel[0], source) : "case";
        const bodyStatements = g.children?.blockStatements?.[0]?.children?.blockStatement ?? [];
        const body: StatementNode[] = [];
        for (const bs of bodyStatements) {
          if (bs.children?.statement?.[0]) {
            body.push(...emitStatement(bs.children.statement[0], source, methodName, paramNames));
          } else {
            body.push({ type: "statement", line: rangeOf(bs)?.startLine ?? 0, text: textOf(bs, source) });
          }
        }
        return { label, body };
      });
      return [{ type: "switch", line, cases }];
    }

    if (inner.tryStatement?.[0]) {
      const tryNode = inner.tryStatement[0];
      const body = tryNode.children?.block?.[0]
        ? emitBlock(tryNode.children.block[0], source, methodName, paramNames)
        : [];
      const catches = (tryNode.children?.catches?.[0]?.children?.catchClause ?? []).map((cc: Node) => {
        const param = cc.children?.catchFormalParameter?.[0];
        const exceptionType = param
          ? textOf(find(param, "unannType")[0] ?? param, source).replace(/^final\s+/, "")
          : "Exception";
        const catchBody = cc.children?.block?.[0]
          ? emitBlock(cc.children.block[0], source, methodName, paramNames)
          : [];
        return { exceptionType, body: catchBody };
      });
      return [{ type: "try", line, body, catches }];
    }

    // throw / break / continue / assert / synchronized / empty
    return [...headerCalls(stmt, source, methodName).map((ci) => ({
      type: "call" as const,
      line: ci.line,
      target: ci.target,
      args: ci.args,
      isRecursive: ci.isRecursive,
    })), { type: "statement", line, text: statementText(stmt, source) }];
  }

  if (c.ifStatement?.[0]) {
    const ifNode = c.ifStatement[0];
    const ic = ifNode.children ?? {};
    const condition = ic.expression?.[0] ? textOf(ic.expression[0], source) : "";
    const statements: Node[] = ic.statement ?? [];
    const branches = [
      {
        condition,
        body: statements[0] ? emitStatement(statements[0], source, methodName, paramNames) : [],
      },
    ];
    if (ic.Else && statements[1]) {
      const elseBody = emitStatement(statements[1], source, methodName, paramNames);
      // else-if chains arrive as nested if nodes, matching the Java CLI
      branches.push({ condition: "else", body: elseBody });
    }
    return [
      ...headerCalls(ic.expression?.[0], source, methodName).map((ci) => ({
        type: "call" as const,
        line: ci.line,
        target: ci.target,
        args: ci.args,
        isRecursive: ci.isRecursive,
      })),
      { type: "if", line, branches },
    ];
  }

  if (c.whileStatement?.[0]) {
    const w = c.whileStatement[0].children ?? {};
    const condition = w.expression?.[0] ? textOf(w.expression[0], source) : "";
    const body = w.statement?.[0] ? emitStatement(w.statement[0], source, methodName, paramNames) : [];
    return [{ type: "loop", kind: "while", line, endLine: rangeOf(stmt)?.endLine ?? 0, boundType: classifyLoopBound(condition, [], paramNames), condition, body }];
  }

  if (c.doStatement?.[0]) {
    const d = c.doStatement[0].children ?? {};
    const condition = d.expression?.[0] ? textOf(d.expression[0], source) : "";
    const body = d.statement?.[0] ? emitStatement(d.statement[0], source, methodName, paramNames) : [];
    return [{ type: "loop", kind: "do-while", line, endLine: rangeOf(stmt)?.endLine ?? 0, boundType: classifyLoopBound(condition, [], paramNames), condition, body }];
  }

  if (c.forStatement?.[0]) {
    const fc = c.forStatement[0].children ?? {};

    if (fc.enhancedForStatement?.[0]) {
      const e = fc.enhancedForStatement[0].children ?? {};
      const varName =
        find(e.localVariableDeclaration?.[0], "variableDeclaratorId")[0]?.children?.Identifier?.[0]?.image ?? "item";
      const iterable = e.expression?.[0] ? textOf(e.expression[0], source) : "";
      const body = e.statement?.[0] ? emitStatement(e.statement[0], source, methodName, paramNames) : [];
      return [
        {
          // IR contract has no enhanced-for kind — the JVM CLI emits "for"
          // with a `var : iterable` condition, so we match that exactly.
          type: "loop",
          kind: "for",
          line,
          endLine: rangeOf(stmt)?.endLine ?? 0,
          boundType: "input-dependent",
          condition: `${varName} : ${iterable}`,
          body,
        },
      ];
    }

    const b = fc.basicForStatement?.[0]?.children ?? {};
    const condition = b.expression?.[0] ? textOf(b.expression[0], source) : "";
    const loopVarNames = find(b.forInit?.[0], "variableDeclaratorId")
      .map((v) => v.children?.Identifier?.[0]?.image)
      .filter(Boolean) as string[];
    const body = b.statement?.[0] ? emitStatement(b.statement[0], source, methodName, paramNames) : [];
    const headerNodes = [b.forInit?.[0], b.expression?.[0], b.forUpdate?.[0]].filter(Boolean);
    const calls = headerNodes.flatMap((n) => headerCalls(n, source, methodName)).map((ci) => ({
      type: "call" as const,
      line: ci.line,
      target: ci.target,
      args: ci.args,
      isRecursive: ci.isRecursive,
    }));
    return [
      ...calls,
      {
        type: "loop",
        kind: "for",
        line,
        endLine: rangeOf(stmt)?.endLine ?? 0,
        boundType: classifyLoopBound(condition, loopVarNames, paramNames),
        condition,
        body,
      },
    ];
  }

  if (c.labeledStatement?.[0]) {
    const inner = c.labeledStatement[0].children?.statement?.[0];
    return inner ? emitStatement(inner, source, methodName, paramNames) : [];
  }

  return [{ type: "statement", line, text: statementText(stmt, source) }];
}

function extractMethod(md: Node, source: string): MethodIR {
  const header = md.children.methodHeader[0].children;
  const declarator = header.methodDeclarator[0].children;
  const name = declarator.Identifier[0].image;

  const params: { name: string; type: string }[] = [];
  const formalParams = [
    ...(header.methodDeclarator[0].children.formalParameterList?.[0]?.children?.formalParameter ?? []),
    ...(header.methodDeclarator[0].children.formalParameterList?.[0]?.children?.lastParameter ?? []),
  ];
  for (const fp of formalParams) {
    const reg = fp.children?.variableParaRegularParameter?.[0]?.children ?? fp.children ?? {};
    const pname = find({ children: reg }, "variableDeclaratorId")[0]?.children?.Identifier?.[0]?.image ?? "?";
    const ptype = reg.unannType?.[0] ? textOf(reg.unannType[0], source) : "";
    params.push({ name: pname, type: ptype });
  }

  const result = header.result?.[0]?.children;
  const returnType = result?.unannType?.[0] ? textOf(result.unannType[0], source) : "void";

  const range = rangeOf(md);
  const paramNames = params.map((p) => p.name);
  const bodyBlock = md.children.methodBody?.[0]?.children?.block?.[0];
  const body = bodyBlock ? emitBlock(bodyBlock, source, name, paramNames) : [];
  // IR contract: method-level `calls` is a plain array of targets (one entry
  // per occurrence), matching the JVM CLI.
  const calls = collectCalls(md, source, name).map((ci) => ci.target);

  return {
    name,
    signature: `${returnType} ${name}(${params.map((p) => p.type).join(", ")})`,
    params,
    returnType,
    startLine: range?.startLine ?? 0,
    endLine: range?.endLine ?? 0,
    body,
    calls,
    comments: [],
  };
}

export function parseJavaTs(source: string): ProgramIR {
  let cst: Node;
  try {
    cst = parse(source);
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Pathological nesting overflows the CST builder's recursion — report it
    // as a parse problem, not an internal failure.
    if (/call stack/i.test(msg)) {
      throw new Error("Parse error: source is too deeply nested.");
    }
    throw new Error(`Parse error: ${msg.split("\n")[0]}`);
  }

  const classes: ClassIR[] = [];
  for (const ncd of find(cst, "normalClassDeclaration")) {
    const name = ncd.children?.typeIdentifier?.[0] ? textOf(ncd.children.typeIdentifier[0], source) : "Unknown";
    const classBody = ncd.children?.classBody?.[0];
    const methods: MethodIR[] = [];
    for (const cbd of classBody?.children?.classBodyDeclaration ?? []) {
      const md = cbd.children?.classMemberDeclaration?.[0]?.children?.methodDeclaration?.[0];
      if (md) methods.push(extractMethod(md, source));
    }
    classes.push({ name, methods });
  }

  return { classes };
}
