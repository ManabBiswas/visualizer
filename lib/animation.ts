"use client";

import { useSyncExternalStore } from "react";

// Preference store for the animated control-flow arrows shown on mermaid
// diagrams (flowchart + call graph). Mirrors lib/theme.ts: a tiny external
// store so every panel (and both panels' toggle buttons) stays in sync, backed
// by localStorage. Defaults to on; the DOM pass itself also honors
// prefers-reduced-motion (see lib/flowchart/edgeAnim), so the OS-level wish
// always wins regardless of this pref.

export type ArrowAnim = "on" | "off";

export const ARROW_ANIM_STORAGE_KEY = "codelens-arrow-anim";

let cached: ArrowAnim | null = null;
const listeners = new Set<() => void>();

function readStored(): ArrowAnim {
  try {
    return localStorage.getItem(ARROW_ANIM_STORAGE_KEY) === "off" ? "off" : "on";
  } catch {
    // Storage unavailable (private mode) — keep the session default.
    return "on";
  }
}

function getSnapshot(): ArrowAnim {
  if (cached === null) cached = readStored();
  return cached;
}

function getServerSnapshot(): ArrowAnim {
  return "on";
}

export function subscribeArrowAnim(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getArrowAnim(): ArrowAnim {
  return getSnapshot();
}

export function setArrowAnim(value: ArrowAnim): void {
  cached = value;
  try {
    localStorage.setItem(ARROW_ANIM_STORAGE_KEY, value);
  } catch {
    // Storage unavailable — pref still applies for this session.
  }
  listeners.forEach((l) => l());
}

export function toggleArrowAnim(): void {
  setArrowAnim(getSnapshot() === "on" ? "off" : "on");
}

export function useArrowAnimation(): { animated: boolean; toggle: () => void } {
  const value = useSyncExternalStore(subscribeArrowAnim, getSnapshot, getServerSnapshot);
  return { animated: value === "on", toggle: toggleArrowAnim };
}
