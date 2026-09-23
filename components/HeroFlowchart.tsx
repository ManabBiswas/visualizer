/**
 * Decorative animated SVG for the landing hero: a mini flowchart that draws
 * itself in (nodes pop, edges stroke-dash), then a pulse dot loops along the
 * main path. Pure SVG + CSS — no JS, no mermaid. Decorative only (aria-hidden);
 * reduced-motion is handled by the global media query in globals.css.
 */
export function HeroFlowchart() {
  return (
    <svg
      viewBox="0 0 360 300"
      role="img"
      aria-hidden="true"
      className="hero-flowchart h-auto w-full"
    >
      <defs>
        <linearGradient id="hf-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8ed5ff" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <filter id="hf-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Edges: drawn via stroke-dashoffset, staggered */}
      <g fill="none" stroke="url(#hf-edge)" strokeWidth="2" strokeLinecap="round">
        <path className="hf-edge hf-edge-1" d="M180 54 V96" />
        <path className="hf-edge hf-edge-2" d="M180 140 V176" />
        <path className="hf-edge hf-edge-3" d="M148 216 H78 V252" />
        <path className="hf-edge hf-edge-4" d="M212 216 H282 V252" />
      </g>

      {/* Branch labels sit beside the yes/no edges */}
      <g className="hf-labels" fill="#8b949e" fontFamily="var(--font-mono)" fontSize="10" fontWeight="600">
        <text x="164" y="164" textAnchor="end">yes</text>
        <text x="196" y="164" textAnchor="start">no</text>
      </g>

      {/* Entry (stadium) */}
      <g className="hf-node hf-node-1">
        <rect x="118" y="22" width="124" height="32" rx="16" fill="#1c2026" stroke="#238636" strokeWidth="2" filter="url(#hf-glow)" />
        <text x="180" y="42" textAnchor="middle" fill="#dfe2eb" fontFamily="var(--font-mono)" fontSize="12" fontWeight="700">
          ▶ search()
        </text>
      </g>

      {/* Decision (diamond) */}
      <g className="hf-node hf-node-2">
        <path d="M180 96 L232 118 L180 140 L128 118 Z" fill="#10141a" stroke="#ffc176" strokeWidth="2" />
        <text x="180" y="122" textAnchor="middle" fill="#dfe2eb" fontFamily="var(--font-mono)" fontSize="11" fontWeight="600">
          mid == t?
        </text>
      </g>

      {/* Left branch: return */}
      <g className="hf-node hf-node-3">
        <rect x="38" y="252" width="80" height="30" rx="15" fill="#1c2026" stroke="#238636" strokeWidth="1.5" />
        <text x="78" y="271" textAnchor="middle" fill="#dfe2eb" fontFamily="var(--font-mono)" fontSize="11">
          return mid
        </text>
      </g>

      {/* Right branch: process */}
      <g className="hf-node hf-node-4">
        <rect x="222" y="252" width="120" height="30" rx="4" fill="#10141a" stroke="#38bdf8" strokeWidth="1.5" />
        <text x="282" y="271" textAnchor="middle" fill="#dfe2eb" fontFamily="var(--font-mono)" fontSize="11">
          low = mid + 1
        </text>
      </g>

      {/* Loop-back hint (curved edge) */}
      <path
        className="hf-edge hf-edge-loop"
        d="M330 267 C348 230 340 170 236 118"
        fill="none"
        stroke="#d2a8ff"
        strokeWidth="1.5"
        strokeDasharray="4 4"
        opacity="0.7"
      />

      {/* Traveling pulse along the main path */}
      <circle r="4" fill="#8ed5ff" filter="url(#hf-glow)" opacity="0">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="1.6s" path="M180 54 L180 96" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.8s" repeatCount="indefinite" begin="1.6s" />
      </circle>
      <circle r="4" fill="#8ed5ff" filter="url(#hf-glow)" opacity="0">
        <animateMotion dur="2.8s" repeatCount="indefinite" begin="2.5s" path="M180 140 L180 176" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="2.8s" repeatCount="indefinite" begin="2.5s" />
      </circle>

      {/* Soft ambient orbs */}
      <circle className="hf-orb hf-orb-1" cx="48" cy="60" r="18" fill="#8ed5ff" opacity="0.08" />
      <circle className="hf-orb hf-orb-2" cx="310" cy="90" r="24" fill="#ffc176" opacity="0.07" />
      <circle className="hf-orb hf-orb-3" cx="300" cy="240" r="16" fill="#d2a8ff" opacity="0.08" />
    </svg>
  );
}
