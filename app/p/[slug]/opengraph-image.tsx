import { ImageResponse } from "next/og";
import { withDb } from "@/lib/db/init";
import { isValidShareSlug } from "@/lib/share/slug";

// Social-preview image for /p/{slug}: a branded 1200x630 card with the
// problem name, difficulty and per-method complexity. Rendered on demand
// from the same slug lookup the page uses — no auth (the slug IS the
// capability), 404 semantics identical to the page.

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "CodeLens — shared solution analysis";

type SlugRow = {
  name: string;
  difficulty: string | null;
} | undefined;

export default async function OgImage({ slug }: { slug: string }) {
  let row: SlugRow;
  let methods: Array<{ method_name: string | null; time_complexity: string | null }> = [];
  let dbFailed = false;
  // Shape-validate the slug exactly like the page does — an invalid shape
  // can never match a stored slug, so go straight to the neutral card
  // without touching the DB.
  if (!isValidShareSlug(slug)) {
    row = undefined;
  } else {
    try {
      // withDb: heal a stale Turso stream so public OG previews don't silently
      // degrade on evictions (this path has no other heal opportunity).
      const loaded = withDb((db) => {
        const r = db
          .prepare("SELECT name, difficulty FROM problems WHERE share_slug = ?")
          .get(slug) as SlugRow;
        const m = r
          ? (db
              .prepare(
                `SELECT a.method_name, a.time_complexity
                 FROM analyses a JOIN problems p ON p.id = a.problem_id
                 WHERE p.share_slug = ?
                 ORDER BY a.created_at DESC`,
              )
              .all(slug) as typeof methods)
          : [];
        return { r, m };
      });
      row = loaded.r;
      methods = loaded.m;
    } catch {
      dbFailed = true;
      row = undefined;
    }
  }

  // Unknown/revoked slug or DB failure: still render a valid image (social
  // crawlers don't benefit from a 404 PNG) — but a neutral one.
  const name = row?.name ?? "Shared analysis";
  const difficulty = row?.difficulty;

  // Dedupe method summaries keeping the newest row per method name.
  const seen = new Set<string>();
  const badges: string[] = [];
  for (const m of methods) {
    if (!m.method_name || seen.has(m.method_name)) continue;
    seen.add(m.method_name);
    badges.push(`${m.method_name}()${m.time_complexity ? ` · ${m.time_complexity}` : ""}`);
    if (badges.length >= 4) break; // card real estate
  }

  const difficultyColor =
    difficulty === "Easy"
      ? "#4caf7d"
      : difficulty === "Medium"
        ? "#e0a83c"
        : difficulty === "Hard"
          ? "#e5534b"
          : "#8a939e";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          backgroundColor: "#10141a",
          backgroundImage: "linear-gradient(135deg, #10141a 0%, #16202b 60%, #12283a 100%)",
          fontFamily: "monospace",
        }}
      >
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              backgroundColor: "#1d4ed8",
              color: "#ffffff",
              fontSize: 30,
              fontWeight: 700,
            }}
          >
            &lt;/&gt;
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#ffffff", fontSize: 34, fontWeight: 700, letterSpacing: 1 }}>CodeLens</span>
            <span style={{ color: "#7d8794", fontSize: 22 }}>solution analysis — shared</span>
          </div>
        </div>

        {/* Problem name + difficulty */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {difficulty && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 18px",
                  borderRadius: 999,
                  backgroundColor: `${difficultyColor}22`,
                  border: `2px solid ${difficultyColor}`,
                  color: difficultyColor,
                  fontSize: 26,
                  fontWeight: 600,
                }}
              >
                {difficulty}
              </span>
            )}
          </div>
          <div
            style={{
              color: "#f2f5f8",
              fontSize: name.length > 34 ? 56 : 72,
              fontWeight: 700,
              lineHeight: 1.1,
              maxHeight: 170,
              overflow: "hidden",
            }}
          >
            {name}
          </div>
        </div>

        {/* Complexity badges */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {badges.length > 0 ? (
            badges.map((b) => (
              <div
                key={b}
                style={{
                  display: "flex",
                  padding: "10px 22px",
                  borderRadius: 10,
                  backgroundColor: "#1a222d",
                  border: "1px solid #2c3947",
                  color: "#9fc2ff",
                  fontSize: 26,
                }}
              >
                {b}
              </div>
            ))
          ) : (
            <div
              style={{
                display: "flex",
                padding: "10px 22px",
                borderRadius: 10,
                backgroundColor: "#1a222d",
                border: "1px solid #2c3947",
                color: "#7d8794",
                fontSize: 26,
              }}
            >
              {dbFailed || !row ? "CodeLens — Java DSA analysis" : "flowcharts · Big-O analysis · revision notes"}
            </div>
          )}
        </div>
      </div>
    ),
    size,
  );
}
