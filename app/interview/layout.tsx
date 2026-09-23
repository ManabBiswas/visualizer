import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Interview — CodeLens",
  description: "Timed mock interview sessions with MCQ and free-answer cards drawn from your own deck.",
};

export default function InterviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
