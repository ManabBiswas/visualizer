import type { Theme } from "@/lib/theme";

type Mermaid = typeof import("mermaid").default;

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
    useMaxWidth: false,
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
let mermaidPromise: Promise<Mermaid> | null = null;

/* Loads mermaid once (shared promise — concurrent callers await the same chunk) and returns the default export. Panels use this instead of a static import so the ~1MB library stays out of the initial bundle and is fetched only when a diagram is actually about to render.
 */
export function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => m.default);
  }
  return mermaidPromise;
}

/** Initialize (or re-initialize) Mermaid for a specific theme. */
function configureMermaid(mermaid: Mermaid, theme: Theme) {
  currentTheme = theme;
  mermaid.initialize({ ...BASE, themeVariables: THEME_VARIABLES[theme] });
}

/** Idempotent per theme — cheap to call on every render. */
export async function ensureMermaid(theme: Theme = "dark"): Promise<Mermaid> {
  const mermaid = await loadMermaid();
  if (currentTheme !== theme) {
    configureMermaid(mermaid, theme);
  }
  return mermaid;
}

let exportCounter = 0;

/* Render a diagram and return the raw SVG string. `theme` selects the skin; exports pass "light" regardless of the UI theme. `onRendered` restores the previous display theme so on-screen panels are unaffected.
 */
export async function renderDiagram(
  diagram: string,
  theme: Theme,
  idPrefix: string,
): Promise<string> {
  const previous = currentTheme;
  const mermaid = await loadMermaid();
  configureMermaid(mermaid, theme);
  const id = `mermaid-${idPrefix}-${Date.now()}-${exportCounter++}`;
  try {
    const { svg } = await mermaid.render(id, diagram);
    return svg;
  } finally {
    if (previous && previous !== theme) {
      configureMermaid(mermaid, previous);
    }
  }
}

/* Back-compat wrapper: render a diagram with an explicit theme (exports, which must always be light regardless of the UI theme) and return the raw SVG string. Restores the previous display theme afterwards.
 */
export async function renderDiagramWithTheme(diagram: string, theme: Theme): Promise<string> {
  return renderDiagram(diagram, theme, "export");
}
