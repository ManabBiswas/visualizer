import { Suspense } from "react";
import InterviewClient from "./InterviewClient";
import { InterviewSkeleton } from "@/components/Skeleton";

export const dynamic = "force-dynamic";

export default function InterviewPage() {
  return (
    <Suspense fallback={<InterviewSkeleton />}>
      <InterviewClient />
    </Suspense>
  );
}