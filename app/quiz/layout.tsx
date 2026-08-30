import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Quiz — CodeLens",
  description: "Spaced-repetition flashcards built from the questions in your own solutions.",
};

export default function QuizLayout({ children }: { children: React.ReactNode }) {
  return children;
}
