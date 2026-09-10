"use client";

import { Toaster, toast } from "react-hot-toast";

// Single styled Toaster for the whole app. react-hot-toast ships its own
// defaults (rounded white cards, snackbar position) which clash with the
// GitHub-dark panel look — this restyles them to match: dark surface, panel
// border, mono labels, error/success accents. Kept in one place so every
// call site uses plain toast.error(...) / toast.success(...) and the
// styling stays consistent app-wide.

export function ToastViewport() {
  return (
    <Toaster
      position="bottom-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: "var(--color-surface-container-low, #161b22)",
          color: "var(--color-on-surface, #dfe2eb)",
          border: "1px solid var(--color-panel-border, #3e484f)",
          borderRadius: "8px",
          fontFamily: "var(--font-jbmono, monospace)",
          fontSize: "13px",
          padding: "10px 14px",
          maxWidth: "420px",
        },
        success: { iconTheme: { primary: "var(--color-success, #238636)", secondary: "#0d1117" } },
        error: { iconTheme: { primary: "var(--color-error, #f85149)", secondary: "#0d1117" } },
      }}
    />
  );
}

export { toast };
