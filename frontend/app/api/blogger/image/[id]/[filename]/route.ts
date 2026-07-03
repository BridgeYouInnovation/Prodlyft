import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/blogger/image/[id]/[filename] — public PNG proxy for
 * gpt-image-1 articles. The trailing filename MUST end in .png so
 * WordPress's wp_check_filetype() accepts the sideload; the value
 * itself is ignored. We used to serve this at /[id]/data but WP
 * rejected files with no extension and silently skipped the featured
 * image — that's the bug fixed here.
 *
 * gpt-image-1 returns base64-encoded image bytes in the same HTTP
 * response (no URL endpoint, unlike dall-e-3's signed URLs). The WP
 * plugin's `media_sideload_image()` needs a URL to fetch — so we stash
 * the base64 in blog_articles.image_b64 at generation time and serve
 * the decoded bytes from here. WordPress fetches once, copies the file
 * into its own media library, and the bytes are then redundant; future
 * fetches still work though, in case WP retries.
 *
 * Intentionally PUBLIC (no auth) because the caller is the user's
 * WordPress server, not the user's browser. Safety relies on:
 *   - Unguessable article id (~9 random bytes = 72 bits of entropy)
 *   - Short-lived utility: WP sideloads once and never looks again
 *   - No identifying info in the bytes (just a generated stock image)
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; filename: string }> }) {
  const { id, filename } = await params;
  if (!/^art_[0-9a-f]+$/i.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Guardrail: only serve requests for image-extension filenames — keeps
  // this endpoint from being probed for arbitrary paths.
  if (!/\.(png|jpg|jpeg|webp)$/i.test(filename)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const r = await pool.query<{ image_b64: string | null }>(
    "SELECT image_b64 FROM blog_articles WHERE id = $1",
    [id],
  );
  const b64 = r.rows[0]?.image_b64;
  if (!b64) return new NextResponse("Not found", { status: 404 });

  // base64 → bytes. Strip any data-URL prefix defensively.
  const stripped = b64.replace(/^data:image\/[a-z]+;base64,/, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(stripped, "base64");
  } catch {
    return new NextResponse("Bad image data", { status: 500 });
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.byteLength),
      // Long cache — the bytes are immutable for an article id. WP only
      // fetches once anyway but this keeps CDNs happy.
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
