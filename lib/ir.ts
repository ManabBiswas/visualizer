// Normalized Intermediate Representation (IR) produced by the Java parser CLI
// and consumed by every downstream pure module (complexity, notes, flowchart, diff).
// Keeping this contract stable is what lets those modules be built/tested
// independently of the Java parsing step.

export type LoopBoundType = "constant" | "parameter" | "input-dependent" | "unknown";

export type StatementNode =
  | {
      type: "loop";
      kind: "for" | "while" | "do-while";
      line: number;
      endLine: number;
      boundType: LoopBoundType;
      condition?: string;
      body: StatementNode[];
    }
  | { type: "if"; line: number; branches: { condition?: string; isElse?: boolean; body: StatementNode[] }[] }
  | { type: "switch"; line: number; cases: { label: string; body: StatementNode[] }[] }
  | { type: "try"; line: number; body: StatementNode[]; catches: { exceptionType: string; body: StatementNode[] }[] }
  | { type: "call"; line: number; target: string; args?: string; isRecursive: boolean }
  | { type: "return"; line: number; value?: string }
  | { type: "statement"; line: number; text: string };

export type CommentTag = {
  line: number;
  tag: "q" | "note" | "why" | "complexity";
  text: string;
};

export type MethodIR = {
  name: string;
  signature: string;
  params: { name: string; type: string }[];
  returnType: string;
  startLine: number;
  endLine: number;
  body: StatementNode[];
  calls: string[];
  comments: CommentTag[];
};

export type ClassIR = {
  name: string;
  javadoc?: string;
  methods: MethodIR[];
};

export type ProgramIR = {
  classes: ClassIR[];
};
