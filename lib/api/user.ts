import { auth } from "@/lib/auth";
import { getOrCreateUser } from "@/lib/db/users";

// Resolves the current session to the internal user id, upserting the users
// row on first sight (keyed on the immutable GitHub id). Returns null when
// the request is unauthenticated.
export async function getAuthedUserId(): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id || !session.user.login) return null;

  const user = getOrCreateUser({
    githubId: session.user.id,
    login: session.user.login,
    name: session.user.name ?? null,
    email: session.user.email ?? null,
    avatarUrl: session.user.avatarUrl ?? null,
  });
  return user.id;
}
