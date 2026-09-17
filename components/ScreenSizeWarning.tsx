"use client";

import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT = 768; // Tailwind `md:` breakpoint

export function ScreenSizeWarning() {
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkScreenSize = () => {
      setIsSmallScreen(window.innerWidth < MOBILE_BREAKPOINT);
    };
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  if (!mounted || !isSmallScreen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-container-lowest p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-sm w-full bg-surface-container-low border border-panel-border rounded-xl p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-warning">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-body-md font-semibold text-on-surface">
              Desktop App Only
            </h3>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              CodeLens is designed for desktop, laptop, and tablet screens ({MOBILE_BREAKPOINT}px+).
              Please use a larger device for the best experience.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setIsSmallScreen(false);
              localStorage.setItem("codelens-dismiss-mobile-warning", "true");
            }}
            className="rounded border border-panel-border px-3 py-1.5 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            Dismiss
          </button>
          <button
            onClick={() => window.open("https://github.com/ManabBiswas/visualizer", "_blank")}
            className="rounded bg-primary px-3 py-1.5 text-body-sm font-medium text-on-primary hover:opacity-90"
          >
            View on GitHub
          </button>
        </div>
      </div>
    </div>
  );
}