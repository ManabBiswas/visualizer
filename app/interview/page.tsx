import { Suspense } from "react";
import InterviewClient from "./InterviewClient";

export const dynamic = "force-dynamic";

export default function InterviewPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center p-6">Loading interview session…</div>}>
      <InterviewClient />
    </Suspense>
  );
}