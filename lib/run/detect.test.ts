import { describe, it, expect } from "vitest";
import { detectMainClass, hasMainMethod } from "./detect";

describe("detectMainClass", () => {
  it("finds the public class and derives the file name from it", () => {
    const info = detectMainClass(
      `import java.util.*;\npublic class Main {\n  public static void main(String[] args) {}\n}\n`,
    );
    expect(info).toEqual({ className: "Main", fileName: "Main.java" });
  });

  it("handles non-public classes with main", () => {
    const info = detectMainClass(`class Solver {\n  public static void main(String[] a) {}\n}`);
    expect(info).toEqual({ className: "Solver", fileName: "Solver.java" });
  });

  it("picks the class containing main when several classes exist", () => {
    const src = `class Helper { int x() { return 1; } }\nclass App {\n  public static void main(String[] args) {}\n}`;
    expect(detectMainClass(src)?.className).toBe("App");
  });

  it("keeps the file name matching the public class even if main is elsewhere", () => {
    const src = `public class Entry {}\nclass Worker {\n  public static void main(String[] args) {}\n}`;
    const info = detectMainClass(src);
    expect(info?.fileName).toBe("Entry.java");
    expect(info?.className).toBe("Worker");
  });

  it("returns null when there is no main method (LeetCode-style classes)", () => {
    expect(detectMainClass(`class Solution { int f(int n) { return n; } }`)).toBeNull();
    expect(hasMainMethod(`class Solution { int f(int n) { return n; } }`)).toBe(false);
  });

  it("does not confuse `.class` literals or comments-ish text with class declarations", () => {
    const src = `class Main {\n  public static void main(String[] args) {\n    Class<?> c = String.class;\n  }\n}`;
    expect(detectMainClass(src)?.className).toBe("Main");
  });

  it("tolerates modifiers on the public class", () => {
    const info = detectMainClass(`public final class Demo {\n  static void main(String[] args) {}\n}`);
    expect(info?.className).toBe("Demo");
  });
});
