// Parser strategy: the TypeScript parser (java-parser) is primary — no JVM
// needed, works on serverless. The JVM CLI remains as an opt-in fallback for
// cross-checking: set CODELENS_PARSER=java.

import { ProgramIR } from "@/lib/ir";
import { parseJavaTs } from "./javaTs";
import { runJavaParser } from "./javaRunner";

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
