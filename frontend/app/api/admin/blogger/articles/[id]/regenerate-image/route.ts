import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { generateImage } from "@/lib/blogger-engine";

export const runtime = "nodejs";

/**
 * POST /api/admin/blogger/articles/{id}/regenerate-image
 *
 * Repair endpoint for articles that published without a featured image
 * (either OpenAI failed at generation time, or WP silently rejected the
 * sideload). Flow:
 *   1. Regenerate image via OpenAI.
 *   2. Persist the b64 on the article row so /api/blogger/image/{id}/featured.png
 *      starts serving it.
 *   3. Call the plugin endpoint POST /wp-json/prodlyft/v1/posts/{wp_post_id}/attach-image
 *      with the proxy URL — WP sideloads it and sets it as the post
 *      thumbnail.
 *   4. Replace our proxy URL with WP's permanent media-library URL and
 *      clear the b64.
 *
 * Admin-only because it re-spends OpenAI credit against articles the
 * user has already been billed for; we don't want end-users to be able
 * to trigger unbounded regenerations.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const { id } = await params;

  const r = await pool.query<{
    id: string;
    title: string | null;
    topic: string;
    wp_post_id: number | null;
    wp_connection_id: string | null;
    site_url: string | null;
    api_key: string | null;
  }>(
    `SELECT a.id, a.title, a.topic, a.wp_post_id, a.wp_connection_id,
            c.site_url, c.api_key
       FROM blog_articles a
       LEFT JOIN wp_connections c ON c.id = a.wp_connection_id
      WHERE a.id = $1`,
    [id],
  );
  const article = r.rows[0];
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  if (!article.wp_post_id || !article.site_url || !article.api_key) {
    return NextResponse.json(
      { error: "Article has no WordPress post to attach an image to" },
      { status: 400 },
    );
  }

  // 1. Generate a fresh image.
  const img = await generateImage({
    title: article.title || article.topic,
    topic: article.topic,
  });
  if (!img || (!img.url && !img.b64)) {
    const reason = img?.error || "OpenAI returned no image";
    await pool.query(
      "UPDATE blog_articles SET image_error = $1, updated_at = NOW() WHERE id = $2",
      [reason, id],
    );
    return NextResponse.json({ error: reason }, { status: 502 });
  }

  // 2. Persist b64 (if any) so the proxy URL serves the bytes. For a
  //    dall-e-3 URL result we skip this — the URL is already public.
  let proxyOrDirectUrl: string;
  if (img.url) {
    proxyOrDirectUrl = img.url;
    await pool.query(
      "UPDATE blog_articles SET image_url = $1, image_prompt = $2, image_error = NULL, updated_at = NOW() WHERE id = $3",
      [img.url, img.prompt, id],
    );
  } else {
    const base = process.env.PUBLIC_BASE_URL || "https://prodlyft.com";
    proxyOrDirectUrl = `${base}/api/blogger/image/${id}/featured.png`;
    await pool.query(
      "UPDATE blog_articles SET image_url = $1, image_prompt = $2, image_b64 = $3, image_error = NULL, updated_at = NOW() WHERE id = $4",
      [proxyOrDirectUrl, img.prompt, img.b64, id],
    );
  }

  // 3. Ask WP to sideload it and set as featured on the existing post.
  const wpRes = await fetch(
    `${article.site_url.replace(/\/+$/, "")}/wp-json/prodlyft/v1/posts/${article.wp_post_id}/attach-image`,
    {
      method: "POST",
      headers: {
        "X-Prodlyft-Key": article.api_key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ image_url: proxyOrDirectUrl }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!wpRes.ok) {
    const body = (await wpRes.text()).slice(0, 300);
    const reason = `WordPress attach-image failed (${wpRes.status}): ${body}. ` +
      "If you see 'rest_no_route', upload the latest Prodlyft Publisher plugin (0.2.0+) on this site.";
    await pool.query(
      "UPDATE blog_articles SET image_error = $1, updated_at = NOW() WHERE id = $2",
      [reason, id],
    );
    return NextResponse.json({ error: reason }, { status: 502 });
  }
  const wpData = (await wpRes.json()) as { image_url?: string; attachment_id?: number };

  // 4. Success — swap in WP's permanent URL, drop b64.
  await pool.query(
    `UPDATE blog_articles
       SET image_url = COALESCE($1, image_url),
           image_b64 = NULL,
           image_error = NULL,
           updated_at = NOW()
     WHERE id = $2`,
    [wpData.image_url || null, id],
  );

  return NextResponse.json({
    ok: true,
    image_url: wpData.image_url || proxyOrDirectUrl,
    attachment_id: wpData.attachment_id || null,
  });
}
