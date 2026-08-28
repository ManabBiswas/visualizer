import { jsPDF } from "jspdf";
import { generateFlowchart } from "@/lib/flowchart/generate";
import { renderDiagramWithTheme } from "@/components/mermaidSetup";
import { svgFromString, svgToPngDataUrl } from "./download";
import { buildWalkthrough } from "@/lib/walkthrough/flatten";
import type { MethodIR, CommentTag, StatementNode } from "@/lib/ir";
import type { ComplexityResult } from "@/lib/complexity/analyze";
import type { BlockComplexity } from "@/lib/complexity/blocks";

// Generates a self-contained, LIGHT-themed PDF report for a single analyzed
// method: metadata, overall + per-block complexity, the source code, a block
// walkthrough, the tagged notes, and the flowchart rendered as an image.

export type ReportInput = {
  title: string;
  difficulty?: string;
  topicTags?: string[];
  link?: string;
  code: string;
  method: MethodIR;
  complexity: ComplexityResult;
  blockComplexity: BlockComplexity[];
};

const INK: readonly number[] = [31, 35, 40];
const MUTED: readonly number[] = [100, 110, 120];
const ACCENT: readonly number[] = [9, 105, 218];

function sanitizeName(s: string): string {
  return s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "codelens";
}

function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function nodeText(node: StatementNode): string {
  switch (node.type) {
    case "loop": {
      const cond = node.condition ? ` (${node.condition})` : "";
      return node.kind === "do-while" ? `do…while${cond}` : `${node.kind}${cond}`;
    }
    case "if":
      return `if (${node.branches[0]?.condition ?? ""})`;
    case "switch":
      return "switch (…)";
    case "try":
      return "try { … }";
    case "call":
      return `${node.target}(${node.args ?? ""})`;
    case "return":
      return node.value ? `return ${node.value}` : "return";
    case "statement":
      return node.text;
  }
}

async function buildFlowchartPng(
  method: MethodIR,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const lightDiagram = generateFlowchart(method, "light");
    const source = await renderDiagramWithTheme(lightDiagram, "light");
    const svg = svgFromString(source);
    if (!svg) return null;
    return await svgToPngDataUrl(svg, "#ffffff", 2);
  } catch {
    return null;
  }
}

export async function downloadPdfReport(input: ReportInput): Promise<void> {
  const flowchart = await buildFlowchartPng(input.method);

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  function newPageIfNeeded(needed: number) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function sectionTitle(text: string) {
    newPageIfNeeded(34);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.text(text.toUpperCase(), margin, y);
    y += 6;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + contentW, y);
    y += 16;
  }

  function bodyText(
    text: string,
    opts: { size?: number; color?: readonly number[]; font?: "helvetica" | "courier"; style?: "normal" | "bold"; gapAfter?: number } = {},
  ) {
    const size = opts.size ?? 10;
    doc.setFont(opts.font ?? "helvetica", opts.style ?? "normal");
    doc.setFontSize(size);
    const c = opts.color ?? INK;
    doc.setTextColor(c[0], c[1], c[2]);
    const lines = doc.splitTextToSize(text, contentW);
    const lineH = size * 1.35;
    for (const ln of lines) {
      newPageIfNeeded(lineH);
      doc.text(ln, margin, y);
      y += lineH;
    }
    y += opts.gapAfter ?? 5;
  }

  // ---- Title + metadata ----
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const titleLines = doc.splitTextToSize(input.title, contentW);
  for (const tl of titleLines) {
    doc.text(tl, margin, y);
    y += 26;
  }
  const metaParts: string[] = [];
  if (input.difficulty) metaParts.push(`Difficulty: ${input.difficulty}`);
  if (input.topicTags && input.topicTags.length > 0) metaParts.push(`Topics: ${input.topicTags.join(", ")}`);
  if (metaParts.length > 0) bodyText(metaParts.join("     "), { size: 9.5, color: MUTED, gapAfter: 2 });
  if (input.link) bodyText(input.link, { size: 8.5, color: MUTED, gapAfter: 2 });
  bodyText(`Method: ${input.method.signature}   ·   Generated ${new Date().toLocaleString()} by CodeLens`, {
    size: 8.5,
    color: MUTED,
    gapAfter: 10,
  });

  // ---- Overall complexity ----
  sectionTitle("Overall complexity");
  bodyText(`Time:  ${input.complexity.time.bigO}   (${input.complexity.time.confidence} confidence)`, {
    font: "courier",
    style: "bold",
    size: 11,
    gapAfter: 2,
  });
  bodyText(input.complexity.time.explanation, { size: 9, color: MUTED, gapAfter: 8 });
  bodyText(`Space: ${input.complexity.space.bigO}   (${input.complexity.space.confidence} confidence)`, {
    font: "courier",
    style: "bold",
    size: 11,
    gapAfter: 2,
  });
  bodyText(input.complexity.space.explanation, { size: 9, color: MUTED });

  // ---- Per-block complexity ----
  sectionTitle("Per-block complexity");
  if (input.blockComplexity.length === 0) {
    bodyText("No loops or method calls detected in this method.", { size: 9.5, color: MUTED });
  } else {
    for (const b of input.blockComplexity) {
      newPageIfNeeded(40);
      doc.setFont("courier", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(`L${b.line}  ${b.kind === "loop" ? "LOOP " : "CALL "}  ${truncate(b.label, 64)}`, margin, y);
      y += 13;
      doc.setFont("courier", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(`time ${b.time}     space ${b.space}`, margin + 14, y);
      y += 12;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      const noteLines = doc.splitTextToSize(b.note, contentW - 14);
      for (const nl of noteLines) {
        newPageIfNeeded(11);
        doc.text(nl, margin + 14, y);
        y += 11;
      }
      y += 6;
    }
  }

  // ---- Code ----
  sectionTitle("Code");
  doc.setFont("courier", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  const codeLineH = 8.5 * 1.4;
  const codeLines = input.code.split("\n");
  codeLines.forEach((raw, i) => {
    const numbered = `${String(i + 1).padStart(3, " ")}  ${raw}`;
    const wrapped = doc.splitTextToSize(numbered, contentW);
    for (const wl of wrapped) {
      newPageIfNeeded(codeLineH);
      doc.text(wl, margin, y);
      y += codeLineH;
    }
  });

  // ---- Block walkthrough ----
  sectionTitle("Block walkthrough");
  const entries = buildWalkthrough(input.method.body);
  if (entries.length === 0) {
    bodyText("No statements detected.", { size: 9.5, color: MUTED });
  } else {
    for (const e of entries) {
      const indent = "    ".repeat(e.depth);
      if (e.kind === "divider") {
        bodyText(`${indent}· ${e.label}`, { font: "courier", size: 9, color: MUTED, gapAfter: 1 });
      } else {
        bodyText(`${indent}${nodeText(e.node)}   (L${e.node.line})`, { font: "courier", size: 9, gapAfter: 1 });
      }
    }
  }

  // ---- Notes ----
  sectionTitle("Notes");
  const notes: CommentTag[] = input.method.comments ?? [];
  if (notes.length === 0) {
    bodyText("No tagged comments (// q:, // note:, // why:, // complexity:) in this method.", {
      size: 9.5,
      color: MUTED,
    });
  } else {
    for (const n of notes) {
      newPageIfNeeded(26);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
      doc.text(`[${n.tag}]  line ${n.line}`, margin, y);
      y += 12;
      bodyText(n.text, { size: 9.5, gapAfter: 7 });
    }
  }

  // ---- Flowchart ----
  sectionTitle("Flowchart");
  if (flowchart) {
    const ratio = flowchart.height / flowchart.width;
    let w = contentW;
    let h = w * ratio;
    const maxH = pageH - margin * 2 - 10;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }
    newPageIfNeeded(h + 10);
    doc.addImage(flowchart.dataUrl, "PNG", margin, y, w, h);
    y += h + 10;
  } else {
    bodyText("The flowchart could not be rendered for this report.", { size: 9.5, color: MUTED });
  }

  doc.save(`${sanitizeName(input.title)}-report.pdf`);
}
