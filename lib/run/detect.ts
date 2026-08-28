// Detects which class to run (the one containing `public static void main`)
// and which file name javac requires (must match the public class, if any).
// Heuristic/regex-based on purpose: if it guesses wrong, javac or the JVM
// produces the authoritative error, which we surface to the user.

export type MainClassInfo = { className: string; fileName: string };

const CLASS_DECL = /(?<!\.)\bclass\s+([A-Za-z_$][\w$]*)/g;
const PUBLIC_CLASS = /public\s+(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|static\s+)*class\s+([A-Za-z_$][\w$]*)/;
const MAIN_METHOD = /\bstatic\s+void\s+main\s*\(/;

export function hasMainMethod(source: string): boolean {
  return MAIN_METHOD.test(source);
}

export function detectMainClass(source: string): MainClassInfo | null {
  if (!hasMainMethod(source)) return null;

  const publicClass = source.match(PUBLIC_CLASS)?.[1] ?? null;

  // The run target is the last class declared before the main method —
  // handles the common "helper class first, main class last" layout.
  const mainIndex = source.search(MAIN_METHOD);
  let runClass: string | null = publicClass;
  for (const match of source.matchAll(CLASS_DECL)) {
    if ((match.index ?? 0) < mainIndex) runClass = match[1];
  }

  if (!runClass) return null;
  return {
    className: runClass,
    // javac requires the file name to match the *public* class when one exists.
    fileName: `${publicClass ?? runClass}.java`,
  };
}
