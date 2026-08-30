import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-panel-padding">
      <div className="flex max-w-lg flex-col items-center gap-4 text-center">
        <p className="font-mono text-code-lg text-text-muted">
          {"// binary search: exhausted the range"}
        </p>
        <h1 className="font-mono text-headline-lg text-text-high-contrast">return -1;</h1>
        <p className="text-headline-md text-text-high-contrast">404 — target not found</p>
        <p className="text-body-sm text-on-surface-variant">
          The page you searched for isn&apos;t in this array. It may have been moved, deleted, or
          never existed — like a missing element in a sorted array.
        </p>
        <pre className="w-full rounded-md border border-panel-border bg-surface-container p-3 text-left font-mono text-code-sm text-on-surface">
          <code>
            {"int low = 0, high = arr.length - 1;\n"}
            {"while (low <= high) {\n"}
            {"  int mid = low + (high - low) / 2;\n"}
            {"  // you are here: arr[mid] != target\n"}
            {"  high = mid - 1; // try a lower range\n"}
            {"}\n"}
            {"return -1; // not found"}
          </code>
        </pre>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded bg-primary-container px-4 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
          >
            Back to home
          </Link>
          <Link
            href="/analyze"
            className="rounded border border-panel-border px-4 py-2 text-body-sm font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
          >
            Open the editor
          </Link>
        </div>
      </div>
    </div>
  );
}
