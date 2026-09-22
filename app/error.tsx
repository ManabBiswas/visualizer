"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-panel-padding">
      <div className="flex max-w-lg flex-col items-center gap-4 text-center">
        <p className="font-mono text-code-lg text-text-muted">
          {"// unexpected exception caught at runtime"}
        </p>
        <h1 className="font-mono text-headline-lg text-text-high-contrast">
          throw new Error();
        </h1>
        <p className="text-headline-md text-text-high-contrast">
          Something went wrong
        </p>
        <p className="text-body-sm text-on-surface-variant">
          {error.message || "An unexpected error occurred while rendering this page."}
        </p>
        {error.digest && (
          <p className="font-mono text-code-sm text-text-muted">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="rounded bg-primary-container px-4 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded border border-panel-border px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
