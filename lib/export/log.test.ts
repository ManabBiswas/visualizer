import { describe, it, expect } from "vitest";
import { logToMarkdown, logToCsv, LogExportRow } from "./log";

const rows: LogExportRow[] = [
  {
    name: "Two Sum",
    link: "https://leetcode.com/problems/two-sum",
    topics: ["Array", "Hash Map"],
    difficulty: "Easy",
    time_complexity: "O(n)",
    space_complexity: "O(n)",
    note_count: 3,
    created_at: "2026-08-01 10:00:00",
  },
  {
    name: 'Tricky, "quoted"',
    link: null,
    topics: [],
    difficulty: null,
    time_complexity: null,
    space_complexity: null,
    note_count: 0,
    created_at: "2026-08-02 10:00:00",
  },
];

describe("logToMarkdown", () => {
  it("renders a section per problem", () => {
    const md = logToMarkdown(rows);
    expect(md).toContain("## Two Sum");
    expect(md).toContain("- Topics: Array, Hash Map");
    expect(md).toContain("`O(n)`");
  });
});

describe("logToCsv", () => {
  it("escapes commas and quotes", () => {
    const csv = logToCsv(rows);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("name,link,topics,difficulty,time_complexity,space_complexity,note_count,created_at");
    expect(csv).toContain('"Tricky, ""quoted"""');
    expect(csv).toContain("Array; Hash Map");
  });
});
