import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Progress",
  description: "Your revision loop at a glance — due cards, activity heatmap, streak and per-topic mastery.",
};

export default function ProgressLayout({ children }: { children: React.ReactNode }) {
  return children;
}
