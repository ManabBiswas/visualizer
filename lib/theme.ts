"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "codelens-theme";

// Small external store so every component (nav toggle, Monaco, Mermaid panels)
// stays in sync. The actual <html data-theme="..."> attribute is set by an
// inline script in the layout before first paint to avoid a theme flash; this
// store reads that attribute on first access so React never disagrees with it.

let cached: Theme | null = null;
const listeners = new Set<() => void>();

function readDom(): Theme {
  if (typeof document !== "undefined") {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
  }
  return "dark";
}

function getSnapshot(): Theme {
  if (cached === null) cached = readDom();
  return cached;
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTheme(): Theme {
  return getSnapshot();
}

export function setTheme(theme: Theme): void {
  cached = theme;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage unavailable (private mode) — theme still applies for this session.
  }
  listeners.forEach((l) => l());
}

export function toggleTheme(): void {
  setTheme(getSnapshot() === "dark" ? "light" : "dark");
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribeTheme, getSnapshot, getServerSnapshot);
  return { theme, toggle: () => setTheme(theme === "dark" ? "light" : "dark") };
}
