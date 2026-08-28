"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";

const links = [
  { href: "/", label: "Home" },
  { href: "/analyze", label: "Editor" },
  { href: "/log", label: "Log" },
  { href: "/quiz", label: "Quiz" },
  { href: "/diff", label: "Diff" },
];

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-11 shrink-0 items-center border-b border-panel-border bg-surface-container-lowest px-container-margin">
      <Link
        href="/"
        className="font-mono text-code-md font-semibold text-text-high-contrast hover:text-primary"
        aria-label="CodeLens home"
      >
        CodeLens
      </Link>
      <nav className="ml-8 flex h-full items-center gap-6">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex h-full items-center border-b-2 text-body-sm ${
                active
                  ? "border-primary text-on-surface"
                  : "border-transparent text-text-muted hover:text-on-surface"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <a
        href="https://github.com/ManabBiswas/visualizer"
        target="_blank"
        rel="noreferrer"
        className="ml-auto flex items-center gap-1.5 rounded border border-panel-border px-2.5 py-1 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        title="Star CodeLens on GitHub"
      >
        <span aria-hidden="true">★</span>
        Star the repo
      </a>
      <button
        onClick={toggle}
        className="ml-2 flex items-center gap-1.5 rounded border border-panel-border px-2.5 py-1 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
        title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label="Toggle color theme"
      >
        <span aria-hidden="true" suppressHydrationWarning>
          {theme === "dark" ? "☀" : "☾"}
        </span>
        <span suppressHydrationWarning>{theme === "dark" ? "Light" : "Dark"}</span>
      </button>
    </header>
  );
}
