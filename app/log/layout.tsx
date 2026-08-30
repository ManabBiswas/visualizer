import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Problem Log — CodeLens",
  description: "Your private log of solved problems with topic and difficulty filters, plus Markdown and CSV export.",
};

export default function LogLayout({ children }: { children: React.ReactNode }) {
  return children;
}
