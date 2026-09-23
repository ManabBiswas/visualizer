/**
 * Decorative hero preview: a mini "product window" showing a flowchart drawing
 * itself. Pure SVG + CSS — no mermaid. Decorative (aria-hidden); CSS animations
 * respect prefers-reduced-motion; SMIL pulses are gated client-side.
 */
"use client";

import { useEffect, useState } from "react";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync external media query on mount
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

const TICK = (n: number, color: string, w = 42) => (
  <rect key={n} x={24} y={48 + n * 13} width={w} height={5} rx={2} fill={color} opacity={0.55} />
);

export function HeroFlowchart() {
  const reducedMotion = useReducedMotion();
  return (
    <svg
      viewBox="0 0 400 320"
      aria-hidden="true"
      className="hero-flowchart h-auto w-full"
      role="presentation"
    >
      <defs>
        <linearGradient id="hf-edge" gradientUnits="userSpaceOnUse" x1="0" y1="52" x2="0" y2="240">
          <stop offset="0%" stopColor="var(--color-primary, #8ed5ff)" />
          <stop offset="100%" stopColor="var(--color-primary-container, #38bdf8)" />
        </linearGradient>
        <linearGradient id="hf-window" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-surface-container-high, #262a31)" />
          <stop offset="100%" stopColor="var(--color-surface-container, #1c2026)" />
        </linearGradient>
        <filter id="hf-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="hf-grid" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="var(--color-outline-variant, #3e484f)" opacity="0.35" />
        </pattern>
        <clipPath id="hf-body">
          <rect x="8" y="36" width="384" height="276" rx="0" />
        </clipPath>
      </defs>

      {/* ── Window chrome ─────────────────────────────────────── */}
      <rect x="4" y="4" width="392" height="312" rx="10" fill="var(--color-surface-container-lowest, #0a0e14)" stroke="var(--color-panel-border, #30363d)" strokeWidth="1.5" />
      <rect x="4" y="4" width="392" height="32" rx="10" fill="url(#hf-window)" />
      <rect x="4" y="26" width="392" height="10" fill="url(#hf-window)" />
      <line x1="4" y1="36" x2="396" y2="36" stroke="var(--color-panel-border, #30363d)" strokeWidth="1" />

      {/* Traffic lights */}
      <circle cx="20" cy="20" r="5" fill="#ff5f57" />
      <circle cx="38" cy="20" r="5" fill="#febc2e" />
      <circle cx="56" cy="20" r="5" fill="#28c840" />

      {/* Title */}
      <text
        x="200"
        y="24"
        textAnchor="middle"
        fill="var(--color-text-muted, #8b949e)"
        fontFamily="var(--font-mono, monospace)"
        fontSize="10"
        fontWeight="500"
      >
        binary-search · flowchart
      </text>

      {/* ── Body: dotted grid ─────────────────────────────────── */}
      <g clipPath="url(#hf-body)">
        <rect x="8" y="36" width="384" height="276" fill="var(--color-surface-container-low, #181c22)" />
        <rect x="8" y="36" width="384" height="276" fill="url(#hf-grid)" />

        {/* Mini code gutter (left rail) */}
        <rect x="8" y="36" width="72" height="276" fill="var(--color-surface-container-lowest, #0a0e14)" opacity="0.6" />
        <line x1="80" y1="36" x2="80" y2="312" stroke="var(--color-panel-border, #30363d)" strokeWidth="1" />
        <g fontFamily="var(--font-mono, monospace)" fontSize="8" fill="var(--color-text-muted, #8b949e)" textAnchor="end">
          <text x="20" y="54">1</text>
          <text x="20" y="67">2</text>
          <text x="20" y="80">3</text>
          <text x="20" y="93">4</text>
          <text x="20" y="106">5</text>
          <text x="20" y="119">6</text>
          <text x="20" y="132">7</text>
        </g>
        {/* Fake syntax-highlighted code ticks */}
        {TICK(0, "var(--color-why-badge, #d2a8ff)", 38)}
        {TICK(1, "var(--color-primary, #8ed5ff)", 52)}
        {TICK(2, "var(--color-note-badge, #79c0ff)", 46)}
        {TICK(3, "var(--color-complexity-badge, #ffa657)", 50)}
        {TICK(4, "var(--color-success, #238636)", 44)}
        {TICK(5, "var(--color-primary, #8ed5ff)", 54)}
        {TICK(6, "var(--color-tertiary, #ffc176)", 40)}

        {/* ── Flowchart (right of gutter) ──────────────────────── */}
        {/* Edges drawn via stroke-dashoffset; pathLength normalizes dash math */}
        <g fill="none" stroke="url(#hf-edge)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path className="hf-edge hf-edge-1" d="M240 76 V100" pathLength={100} />
          {/* yes branch → left, starting at the diamond's left vertex */}
          <path className="hf-edge hf-edge-2" d="M200 124 H148 V210" pathLength={100} />
          {/* no branch → right, starting at the diamond's right vertex */}
          <path className="hf-edge hf-edge-3" d="M280 124 H332 V210" pathLength={100} />
        </g>

        {/* Loop-back (dashed purple): process bottom → under the row → diamond bottom tip */}
        <g className="hf-edge-loop" fill="none" stroke="var(--color-why-badge, #d2a8ff)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M332 234 V244 Q332 254 322 254 H250 Q240 254 240 244 V153" />
          <polygon points="240,146 235,157 245,157" fill="var(--color-why-badge, #d2a8ff)" stroke="none" />
        </g>

        {/* Branch labels (sit above each horizontal segment) */}
        <g className="hf-labels" fill="var(--color-text-muted, #8b949e)" fontFamily="var(--font-mono, monospace)" fontSize="9" fontWeight="600">
          <text x="174" y="117" textAnchor="middle">yes</text>
          <text x="306" y="117" textAnchor="middle">no</text>
        </g>

        {/* Entry node */}
        <g className="hf-node hf-node-1">
          <rect x="192" y="52" width="96" height="24" rx="12" fill="var(--color-surface-container, #1c2026)" stroke="var(--color-success, #238636)" strokeWidth="2" filter="url(#hf-glow)" />
          <text x="240" y="68" textAnchor="middle" fill="var(--color-on-surface, #dfe2eb)" fontFamily="var(--font-mono, monospace)" fontSize="10" fontWeight="700">
            search()
          </text>
        </g>

        {/* Decision diamond */}
        <g className="hf-node hf-node-2">
          <path d="M240 100 L280 124 L240 148 L200 124 Z" fill="var(--color-surface-container-lowest, #0a0e14)" stroke="var(--color-tertiary, #ffc176)" strokeWidth="2" />
          <text x="240" y="128" textAnchor="middle" fill="var(--color-on-surface, #dfe2eb)" fontFamily="var(--font-mono, monospace)" fontSize="9" fontWeight="600">
            mid == t?
          </text>
        </g>

        {/* Left: return */}
        <g className="hf-node hf-node-3">
          <rect x="104" y="210" width="88" height="24" rx="12" fill="var(--color-surface-container, #1c2026)" stroke="var(--color-success, #238636)" strokeWidth="1.5" />
          <text x="148" y="226" textAnchor="middle" fill="var(--color-on-surface, #dfe2eb)" fontFamily="var(--font-mono, monospace)" fontSize="9">
            return mid
          </text>
        </g>

        {/* Right: process */}
        <g className="hf-node hf-node-4">
          <rect x="290" y="210" width="84" height="24" rx="4" fill="var(--color-surface-container-lowest, #0a0e14)" stroke="var(--color-primary-container, #38bdf8)" strokeWidth="1.5" />
          <text x="332" y="226" textAnchor="middle" fill="var(--color-on-surface, #dfe2eb)" fontFamily="var(--font-mono, monospace)" fontSize="9">
            low = mid+1
          </text>
        </g>

        {/* Complexity badge (product feature callout) */}
        <g className="hf-badge">
          <rect className="hf-badge-chip" x="164" y="270" width="144" height="22" rx="11" fill="var(--color-surface-container-high, #262a31)" stroke="var(--color-panel-border, #30363d)" strokeWidth="1" />
          <text x="236" y="285" textAnchor="middle" fontFamily="var(--font-mono, monospace)" fontSize="9" fontWeight="600">
            <tspan fill="var(--color-complexity-badge, #ffa657)">O(log n)</tspan>
            <tspan fill="var(--color-text-muted, #8b949e)"> · </tspan>
            <tspan className="hf-conf" fill="var(--color-success, #3fb950)">98% conf</tspan>
          </text>
        </g>

        {/* Traveling pulse along the main path (SMIL — gated for reduced motion) */}
        {!reducedMotion && (
          <>
            <circle r="3.5" fill="var(--color-primary, #8ed5ff)" filter="url(#hf-glow)" opacity="0">
              <animateMotion dur="3.2s" repeatCount="indefinite" begin="1.8s" path="M240 76 L240 100" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="3.2s" repeatCount="indefinite" begin="1.8s" />
            </circle>
            {/* Pulse on the yes branch */}
            <circle r="3" fill="var(--color-success, #238636)" filter="url(#hf-glow)" opacity="0">
              <animateMotion dur="3.2s" repeatCount="indefinite" begin="2.6s" path="M200 124 H148 V210" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="3.2s" repeatCount="indefinite" begin="2.6s" />
            </circle>
            {/* Pulse on the no branch — full narrative path */}
            <circle r="3" fill="var(--color-primary, #8ed5ff)" filter="url(#hf-glow)" opacity="0">
              <animateMotion dur="3.2s" repeatCount="indefinite" begin="3.4s" path="M280 124 H332 V210" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.85;1" dur="3.2s" repeatCount="indefinite" begin="3.4s" />
            </circle>
          </>
        )}
      </g>
    </svg>
  );
}
