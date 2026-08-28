import { CommentTag, MethodIR } from "@/lib/ir";

// Matches tagged comments at the start of a line OR trailing after code
// (e.g. `int mid = lo + (hi - lo) / 2; // why: avoid overflow`).
// The `[^:]` guard avoids matching URLs like `https://...`.
const TAG_PATTERN = /(?:^|[^:])\/\/\s*(q|note|why|complexity)\s*:\s*(.+?)\s*$/i;

/**
 * Scans raw source lines for tagged comments (// q:, // note:, // why:, // complexity:),
 * both as standalone comment lines and as trailing comments after code, and returns them
 * as CommentTag entries. Runs on raw source rather than only the AST so comments the
 * parser doesn't attribute cleanly are still caught.
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
 * mutating a shallow copy of each method's `comments` field. Tags written
 * directly above a method (e.g. describing it) are attributed to it: the
 * lower bound is the line after the previous method ends.
 */
export function attachTagsToMethods(methods: MethodIR[], tags: CommentTag[]): MethodIR[] {
  return methods.map((method, i) => {
    const lowerBound = i === 0 ? 1 : methods[i - 1].endLine + 1;
    return {
      ...method,
      comments: tags.filter((t) => t.line >= lowerBound && t.line <= method.endLine),
    };
  });
}
