import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { ProgramIR } from "@/lib/ir";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { extractCommentTags, attachTagsToMethods } from "@/lib/notes/extract";
import { generateFlowchart } from "@/lib/flowchart/generate";

const ROOT = process.cwd();
const CLASSES_DIR = path.join(ROOT, "parser", "target", "classes");

function findJavaParserJar(): string | null {
  if (process.env.JAVAPARSER_JAR && fs.existsSync(process.env.JAVAPARSER_JAR)) {
    return process.env.JAVAPARSER_JAR;
  }
  const home = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
  const candidate = path.join(
    home,
    ".m2",
    "repository",
    "com",
    "github",
    "javaparser",
    "javaparser-core",
    "3.26.2",
    "javaparser-core-3.26.2.jar"
  );
  return fs.existsSync(candidate) ? candidate : null;
}

const jar = findJavaParserJar();
const hasClasses = fs.existsSync(CLASSES_DIR);
const canRun = hasClasses && jar !== null;

function runParser(source: string): ProgramIR {
  const cp = `${CLASSES_DIR}${path.delimiter}${jar}`;
  const out = execFileSync("java", ["-cp", cp, "codelens.Main"], {
    input: source,
    encoding: "utf-8",
  });
  return JSON.parse(out) as ProgramIR;
}

describe.skipIf(!canRun)("parser -> TS pipeline integration", () => {
  const SOURCE = `class Solution {
    // why: binary search halves the search space each iteration
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        // q: why use low + (high - low) / 2 instead of (low + high) / 2?
        while (low <= high) {
            int mid = low + (high - low) / 2; // note: mid stays inside the search range
            if (arr[mid] == target) {
                return mid;
            } else if (arr[mid] < target) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        return -1;
    }
    void mergeSort(int[] a, int l, int r) {
        if (l < r) {
            int m = l + (r - l) / 2;
            mergeSort(a, l, m);
            mergeSort(a, m + 1, r);
            merge(a, l, m, r);
        }
    }
}
`;

  it("emits IR that classifies binary search as O(log n)", () => {
    const ir = runParser(SOURCE);
    const search = ir.classes[0].methods.find((m) => m.name === "search");
    expect(search).toBeDefined();
    const result = analyzeComplexity(search!);
    expect(result.time.bigO).toBe("O(log n)");
  });

  it("classifies merge sort as O(n log n)", () => {
    const ir = runParser(SOURCE);
    const mergeSort = ir.classes[0].methods.find((m) => m.name === "mergeSort");
    const result = analyzeComplexity(mergeSort!);
    expect(result.time.bigO).toBe("O(n log n)");
  });

  it("attaches trailing comment tags and renders them inside the flowchart", () => {
    const ir = runParser(SOURCE);
    const tags = extractCommentTags(SOURCE.split("\n"));
    expect(tags.map((t) => t.tag).sort()).toEqual(["note", "q", "why"]);
    const search = ir.classes[0].methods.find((m) => m.name === "search")!;
    const [withComments] = attachTagsToMethods([search], tags);
    expect(withComments.comments).toHaveLength(3);
    const diagram = generateFlowchart(withComments);
    expect(diagram).toContain("[why] binary search halves the search space each iteration");
    expect(diagram).toContain("[q] why use low + (high - low) / 2 instead of (low + high) / 2?");
    expect(diagram).toContain("[note] mid stays inside the search range");
    expect(diagram).toContain("classDef loopNode");
  });
});
