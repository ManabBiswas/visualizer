import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Diff — CodeLens",
  description: "Compare brute-force and optimized Java solutions side by side with a complexity delta.",
};

export default function DiffLayout({ children }: { children: React.ReactNode }) {
  return children;
}
