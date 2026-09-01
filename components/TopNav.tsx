"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useTheme } from "@/lib/theme";

const links = [
  { href: "/", label: "Home" },
  { href: "/analyze", label: "Editor" },
  { href: "/log", label: "Log" },
  { href: "/quiz", label: "Quiz" },
  { href: "/progress", label: "Progress" },
  { href: "/diff", label: "Diff" },
];

export function TopNav() {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const { data: session, status } = useSession();

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
      <div className="ml-2 flex items-center gap-1.5">
        {status === "loading" ? (
          <span className="text-body-sm text-text-muted">…</span>
        ) : session?.user ? (
          <>
            {session.user.avatarUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- GitHub avatar, fixed remote origin
              <img
                src={session.user.avatarUrl}
                alt=""
                className="h-6 w-6 rounded-full border border-panel-border"
              />
            )}
            <span className="max-w-24 truncate text-body-sm text-on-surface-variant" title={session.user.login}>
              {session.user.login}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="rounded border border-panel-border px-2 py-1 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              title="Sign out"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={() => signIn("github", { callbackUrl: "/analyze" })}
            className="rounded bg-primary-container px-3 py-1 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
            title="Sign in with GitHub"
          >
            Sign in
          </button>
        )}
      </div>
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 rounded border border-panel-border px-2.5 py-1 text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
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
