// Parser strategy: the TypeScript parsers are primary — no JVM, no native
// builds, works on serverless. Java parses in-process via java-parser
// (Chevrotain); Python via web-tree-sitter WASM (grammar committed under
// lib/parser/wasm/). The JVM CLI remains an opt-in Java cross-check:
// set CODELENS_PARSER=java.

import { ProgramIR } from "@/lib/ir";
import { parseJavaTs } from "./javaTs";
import { runJavaParser } from "./javaRunner";
import { parsePython } from "./python";
import { parseCpp } from "./cpp";
import type { Language } from "@/lib/security/validate";

export type ParserEngine = "ts" | "java";

export function getParserEngine(): ParserEngine {
  return process.env.CODELENS_PARSER === "java" ? "java" : "ts";
}

export async function parseJava(source: string): Promise<ProgramIR> {
  if (getParserEngine() === "java") {
    return runJavaParser(source);
  }
  return parseJavaTs(source);
}

/** Language-aware entry point used by the analyze pipeline. */
export async function parseSource(source: string, language: Language): Promise<ProgramIR> {
  if (language === "python") return parsePython(source);
  if (language === "cpp" || language === "c") return parseCpp(source);
  return parseJava(source);
}

export { parsePython, parseCpp };
