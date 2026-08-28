export type LogExportRow = {
  name: string;
  link: string | null;
  topics: string[];
  difficulty: string | null;
  time_complexity: string | null;
  space_complexity: string | null;
  note_count: number;
  created_at: string;
};

export function logToMarkdown(rows: LogExportRow[]): string {
  const lines: string[] = ["# CodeLens — Problem Log", "", `_Exported ${new Date().toISOString().slice(0, 10)} — ${rows.length} problems_`, ""];
  for (const row of rows) {
    lines.push(`## ${row.name}`);
    if (row.link) lines.push(`- Link: ${row.link}`);
    lines.push(`- Topics: ${row.topics.length ? row.topics.join(", ") : "—"}`);
    lines.push(`- Difficulty: ${row.difficulty ?? "—"}`);
    lines.push(`- Time complexity: \`${row.time_complexity ?? "—"}\``);
    lines.push(`- Space complexity: \`${row.space_complexity ?? "—"}\``);
    lines.push(`- Notes: ${row.note_count}`);
    lines.push(`- Solved: ${row.created_at.slice(0, 10)}`);
    lines.push("");
  }
  return lines.join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function logToCsv(rows: LogExportRow[]): string {
  const header = ["name", "link", "topics", "difficulty", "time_complexity", "space_complexity", "note_count", "created_at"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.name),
        csvEscape(row.link ?? ""),
        csvEscape(row.topics.join("; ")),
        csvEscape(row.difficulty ?? ""),
        csvEscape(row.time_complexity ?? ""),
        csvEscape(row.space_complexity ?? ""),
        String(row.note_count),
        csvEscape(row.created_at),
      ].join(",")
    );
  }
  return lines.join("\n");
}
