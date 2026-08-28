import mermaid from "mermaid";

let initialized = false;

// Shared Mermaid config for every diagram panel.
// htmlLabels MUST stay false: HTML labels render as <foreignObject>, which
// taints the canvas during PNG export and breaks downloads.
export function ensureMermaid() {
  if (initialized) return;
  initialized = true;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    // Mermaid 11 reads the TOP-LEVEL htmlLabels first (flowchart.htmlLabels is
    // deprecated). false forces SVG <text> labels instead of <foreignObject>,
    // which would otherwise taint the canvas during PNG export.
    htmlLabels: false,
    flowchart: {
      htmlLabels: false,
      curve: "basis",
      nodeSpacing: 35,
      rankSpacing: 45,
      padding: 10,
    },
    themeVariables: {
      background: "#10141a",
      primaryColor: "#10141a",
      primaryBorderColor: "#38bdf8",
      primaryTextColor: "#dfe2eb",
      lineColor: "#87929a",
      secondaryColor: "#1c2026",
      tertiaryColor: "#262a31",
      fontFamily: "JetBrains Mono, monospace",
      fontSize: "14px",
    },
  });
}
