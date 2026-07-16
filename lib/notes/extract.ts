import { CommentTag, MethodIR } from "@/lib/ir";

const TAG_PATTERN = /^\s*\/\/\s*(q|note|why|complexity)\s*:\s*(.+)$/i;

/**
 * Scans raw source lines for tagged comments (// q:, // note:, // why:, // complexity:)
 * and returns them as CommentTag entries. Runs on raw source rather than only the AST
 * so trailing/inline comments on lines the parser doesn't attribute cleanly are still caught.
 */
export function extractCommentTags(sourceLines: string[]): CommentTag[] {
  const tags: CommentTag[] = [];
  sourceLines.forEach((line, idx) => {
    const match = line.match(TAG_PATTERN);
    if (match) {
      tags.push({
        line: idx + 1,
        tag: match[1].toLowerCase() as CommentTag["tag"],
        text: match[2].trim(),
      });
    }
  });
  return tags;
}

/**
 * Attaches extracted tags to the nearest enclosing method by line range,
 * mutating a shallow copy of each method's `comments` field.
 */
export function attachTagsToMethods(methods: MethodIR[], tags: CommentTag[]): MethodIR[] {
  return methods.map((method) => ({
    ...method,
    comments: tags.filter((t) => t.line >= method.startLine && t.line <= method.endLine),
  }));
}
