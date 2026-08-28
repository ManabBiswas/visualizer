import mermaid from "mermaid";
import type { Theme } from "@/lib/theme";

// Shared Mermaid config for every diagram panel.
// htmlLabels MUST stay false: HTML labels render as <foreignObject>, which
// taints the canvas during PNG export and breaks downloads.

const MONO = "'Cascadia Code', Consolas, 'SF Mono', Menlo, 'DejaVu Sans Mono', monospace";

const BASE = {
  startOnLoad: false,
  securityLevel: "loose" as const,
  theme: "base" as const,
  htmlLabels: false,
  flowchart: {
    htmlLabels: false,
    curve: "basis" as const,
    nodeSpacing: 35,
    rankSpacing: 45,
    padding: 10,
  },
};

const THEME_VARIABLES: Record<Theme, Record<string, string>> = {
  dark: {
    background: "#10141a",
    primaryColor: "#10141a",
    primaryBorderColor: "#38bdf8",
    primaryTextColor: "#dfe2eb",
    lineColor: "#87929a",
    secondaryColor: "#1c2026",
    tertiaryColor: "#262a31",
    fontFamily: MONO,
    fontSize: "14px",
  },
  light: {
    background: "#ffffff",
    primaryColor: "#ffffff",
    primaryBorderColor: "#0969da",
    primaryTextColor: "#1f2328",
    lineColor: "#6e7781",
    secondaryColor: "#f6f8fa",
    tertiaryColor: "#eef1f4",
    fontFamily: MONO,
    fontSize: "14px",
  },
};

let currentTheme: Theme | null = null;

/** Initialize (or re-initialize) Mermaid for a specific theme. */
export function configureMermaid(theme: Theme) {
  currentTheme = theme;
  mermaid.initialize({ ...BASE, themeVariables: THEME_VARIABLES[theme] });
}

/** Idempotent per theme — cheap to call on every render. */
export function ensureMermaid(theme: Theme = "dark") {
  if (currentTheme === theme) return;
  configureMermaid(theme);
}

/**
 * Render a diagram with an explicit theme and return the raw SVG string.
 * Used for exports, which must always be light regardless of the UI theme.
 * Restores the previous display theme afterwards so on-screen panels are
 * unaffected.
 */
export async function renderDiagramWithTheme(diagram: string, theme: Theme): Promise<string> {
  const previous = currentTheme;
  configureMermaid(theme);
  const id = `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { svg } = await mermaid.render(id, diagram);
    return svg;
  } finally {
    configureMermaid(previous ?? "dark");
  }
}
