"use client";

import { signIn, useSession } from "next-auth/react";

/**
 * Centered panel shown to signed-out visitors on pages whose data is
 * per-account. Renders nothing while the session is loading or once
 * signed in, so pages can drop it in right above their normal content.
 */
export function SignInPrompt({
  title,
  message,
  callbackUrl,
}: {
  title: string;
  message: string;
  callbackUrl: string;
}) {
  const { status } = useSession();

  if (status !== "unauthenticated") return null;

  return (
    <div className="flex flex-1 items-center justify-center p-panel-padding">
      <div className="flex max-w-md flex-col gap-3 rounded-md border border-panel-border bg-surface-container p-6 text-center">
        <h2 className="text-headline-md text-text-high-contrast">{title}</h2>
        <p className="text-body-sm text-on-surface-variant">{message}</p>
        <button
          onClick={() => signIn("github", { callbackUrl })}
          className="mx-auto rounded bg-primary-container px-4 py-2 text-body-sm font-semibold text-on-primary-container hover:opacity-90"
        >
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
