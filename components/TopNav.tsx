"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Editor" },
  { href: "/log", label: "Log" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex h-11 shrink-0 items-center border-b border-panel-border bg-surface-container-lowest px-container-margin">
      <span className="font-mono text-code-md font-semibold text-text-high-contrast">
        CodeLens
      </span>
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
    </header>
  );
}
