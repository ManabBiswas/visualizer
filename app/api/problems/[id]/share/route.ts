import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/init";
import { getAuthedUserId } from "@/lib/api/user";
import { isValidId } from "@/lib/security/validate";
import { redactSecrets } from "@/lib/security/env";
import { generateShareSlug } from "@/lib/share/slug";

// Share-link management for one problem. POST = create-or-return the slug
// (idempotent — an existing slug is returned, never rotated, so old links
// keep working); DELETE = revoke (slug -> NULL, /p/{slug} 404s immediately).

type ShareRow = { id: string; share_slug: string | null };

function ownedProblem(db: ReturnType<typeof getDb>, id: string, userId: string): ShareRow | undefined {
  // Ownership via user_id — a foreign problem is indistinguishable from a
  // nonexistent one so ids can't be probed.
  return db
    .prepare("SELECT id, share_slug FROM problems WHERE id = ? AND user_id = ?")
    .get(id, userId) as ShareRow | undefined;
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to share your problems." }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid problem id." }, { status: 400 });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json({ error: redactSecrets((err as Error).message) }, { status: 503 });
  }

  const problem = ownedProblem(db, id, userId);
  if (!problem) {
    return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  }

  // Idempotent: keep an existing slug so already-shared links don't break.
  if (problem.share_slug) {
    return NextResponse.json({ slug: problem.share_slug });
  }

  // Race-safe issue loop: 12 base62 chars make collisions vanishingly rare,
  // but the UNIQUE index is the real guard — retry on collision.
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generateShareSlug();
    try {
      db.prepare("UPDATE problems SET share_slug = ? WHERE id = ? AND user_id = ?").run(slug, id, userId);
      return NextResponse.json({ slug });
    } catch (err) {
      const msg = (err as Error).message;
      if (/UNIQUE/i.test(msg)) continue; // collision — try a new slug
      return NextResponse.json({ error: redactSecrets(msg) }, { status: 500 });
    }
  }
  return NextResponse.json({ error: "Could not generate a share link — try again." }, { status: 500 });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getAuthedUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in to manage your share links." }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!isValidId(id)) {
    return NextResponse.json({ error: "Invalid problem id." }, { status: 400 });
  }

  let db;
  try {
    db = getDb();
  } catch (err) {
    return NextResponse.json({ error: redactSecrets((err as Error).message) }, { status: 503 });
  }

  const problem = ownedProblem(db, id, userId);
  if (!problem) {
    return NextResponse.json({ error: "Problem not found." }, { status: 404 });
  }

  db.prepare("UPDATE problems SET share_slug = NULL WHERE id = ? AND user_id = ?").run(id, userId);
  return NextResponse.json({ revoked: true });
}
