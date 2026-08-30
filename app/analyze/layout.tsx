import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyze — CodeLens",
  description: "Paste a Java solution to get flowcharts, call graphs and Big-O complexity estimates.",
};

export default function AnalyzeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
