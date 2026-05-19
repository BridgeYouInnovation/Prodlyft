import { pool, findUserById } from "./db";
import { LENGTH_WORDS, type LengthTarget, type PublishStatus } from "./blogger";
import { TOKEN_COSTS, getBalance, tryDebitTokens } from "./tokens";

export class InsufficientTokensError extends Error {
  constructor(public required: number, public balance: number) {
    super(
      `Out of credits — need ${required} tokens for this post, have ${balance}. ` +
        "Top up to keep generating articles.",
    );
    this.name = "InsufficientTokensError";
  }
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";

function newId(prefix: string): string {
  const buf = crypto.getRandomValues(new Uint8Array(9));
  return prefix + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function envOpenRouterKey(): string {
  const k = process.env.OPENROUTER_API_KEY || "";
  if (!k) throw new Error("OPENROUTER_API_KEY env var is not set on the frontend");
  return k;
}

function envOpenAIKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}

const ARTICLE_MODEL = process.env.OPENROUTER_BLOGGER_MODEL || "anthropic/claude-sonnet-4.5";

const SYSTEM_PROMPT = `You are a senior blog writer. Given a topic, tone and target length, you write
publication-ready blog posts in clean WordPress HTML.

Reply with ONE JSON object only — no prose, no markdown fences:
{
  "title":   "Engaging headline under 70 chars",
  "excerpt": "1-2 sentence summary, plain text",
  "body":    "The full post in HTML. Use <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <blockquote>. Do NOT include <html>, <head>, or <body> wrappers."
}

Hard rules:
- HTML only inside body — no markdown like ## or **bold**.
- Don't invent statistics, prices, names, or quotes. If unsure, generalise.
- Open with a 1-2 paragraph intro, then 3-6 H2 sections, then a brief conclusion.
- Avoid the phrase "in conclusion" and other AI tells.
- Match the requested tone; default to professional and engaging.`;

interface GenerateContentInput {
  topic: string;
  tone?: string | null;
  length: LengthTarget;
}

interface GeneratedContent {
  title: string;
  excerpt: string;
  body: string;
}

export async function generateContent(input: GenerateContentInput): Promise<GeneratedContent> {
  const words = LENGTH_WORDS[input.length] ?? 900;
  const userMsg = [
    `Topic: ${input.topic}`,
    `Tone: ${input.tone?.trim() || "professional and engaging"}`,
    `Target length: ~${words} words`,
  ].join("\n");

  const r = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envOpenRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://prodlyft.com",
      "X-Title": "Prodlyft Auto Blogger",
    },
    body: JSON.stringify({
      model: ARTICLE_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!r.ok) {
    throw new Error(`OpenRouter HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
  }
  const body = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = body?.choices?.[0]?.message?.content || "";
  let parsed: GeneratedContent;
  try {
    parsed = JSON.parse(raw) as GeneratedContent;
  } catch {
    const m = raw.match(/\{[\s\S]+\}/);
    if (!m) throw new Error("AI did not return JSON");
    parsed = JSON.parse(m[0]) as GeneratedContent;
  }
  if (!parsed.title || !parsed.body) {
    throw new Error("AI response missing title or body");
  }
  return parsed;
}

/**
 * Returns a public URL for the generated featured image (DALL·E 3 returns a
 * 1-hour signed URL — plenty for the WP plugin to sideload from). Returns
 * null if OPENAI_API_KEY isn't configured (image gen silently skipped).
 */
export async function generateImage(opts: { title: string; topic: string }): Promise<{ url: string; prompt: string } | null> {
  const key = envOpenAIKey();
  if (!key) return null;

  const prompt =
    `Photographic featured image for a blog post titled "${opts.title}". ` +
    `Subject relates to: ${opts.topic}. ` +
    "Wide 16:9 composition, natural lighting, magazine-quality. No text or logos overlaid.";

  const r = await fetch(OPENAI_IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      size: "1792x1024",
      quality: "standard",
      response_format: "url",
      n: 1,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    console.error("[blogger] image gen failed:", r.status, (await r.text()).slice(0, 240));
    return null;
  }
  const data = (await r.json()) as { data?: { url?: string }[] };
  const url = data?.data?.[0]?.url;
  return url ? { url, prompt } : null;
}

interface PostToWpInput {
  siteUrl: string;
  apiKey: string;
  title: string;
  body: string;
  excerpt: string;
  status: PublishStatus;
  imageUrl?: string | null;
  categoryIds?: number[] | null;
  tagNames?: string[] | null;
}

export async function postToWp(input: PostToWpInput): Promise<{ wp_post_id: number; wp_post_url: string; image_url: string | null }> {
  const r = await fetch(`${input.siteUrl.replace(/\/+$/, "")}/wp-json/prodlyft/v1/posts`, {
    method: "POST",
    headers: {
      "X-Prodlyft-Key": input.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      content: input.body,
      excerpt: input.excerpt,
      status: input.status,
      featured_image_url: input.imageUrl || undefined,
      category_ids: input.categoryIds || undefined,
      tag_names: input.tagNames || undefined,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) {
    throw new Error(`WordPress POST failed (${r.status}): ${(await r.text()).slice(0, 240)}`);
  }
  const data = (await r.json()) as { id?: number; permalink?: string; image_url?: string | null };
  if (!data.id || !data.permalink) {
    throw new Error("WordPress did not return a post id");
  }
  return { wp_post_id: data.id, wp_post_url: data.permalink, image_url: data.image_url ?? null };
}

interface GenerateAndPostInput {
  userId: number;
  scheduleId?: string | null;
  connectionId: string;
  topic: string;
  tone?: string | null;
  length: LengthTarget;
  publishStatus: PublishStatus;
  withImage: boolean;
  categoryIds?: number[] | null;
  tagNames?: string[] | null;
}

interface DbConnRow {
  id: string;
  user_id: number;
  site_url: string;
  api_key: string;
}

export async function generateAndPost(input: GenerateAndPostInput): Promise<{ articleId: string }> {
  // 1. Pre-flight token check. Articles cost 5 tokens (no image) or 10 with
  //    image. We check the balance up-front so we don't kick off a paid AI
  //    generation when the user can't afford it; the actual debit happens
  //    only after the WP post succeeds (rule: pay for delivered units).
  const user = await findUserById(input.userId);
  if (!user) throw new Error("User not found");

  const cost = input.withImage ? TOKEN_COSTS.BLOG_POST_WITH_IMAGE : TOKEN_COSTS.BLOG_POST;
  if (!user.is_admin) {
    const { balance } = await getBalance(input.userId);
    if (balance >= 0 && balance < cost) {
      throw new InsufficientTokensError(cost, balance);
    }
  }

  // 2. Resolve the WP connection (must belong to this user).
  const cr = await pool.query<DbConnRow>(
    "SELECT id, user_id, site_url, api_key FROM wp_connections WHERE id = $1 AND user_id = $2",
    [input.connectionId, input.userId],
  );
  if (cr.rowCount === 0) throw new Error("WP connection not found or not yours");
  const conn = cr.rows[0];

  // 3. Insert the article row up-front so failures still leave a trail in history.
  const articleId = newId("art_");
  await pool.query(
    `INSERT INTO blog_articles
       (id, user_id, wp_connection_id, schedule_id, topic, tone, status, publish_status)
     VALUES ($1, $2, $3, $4, $5, $6, 'generating', $7)`,
    [
      articleId,
      input.userId,
      input.connectionId,
      input.scheduleId ?? null,
      input.topic,
      input.tone ?? null,
      input.publishStatus,
    ],
  );

  try {
    // 4. Generate the post content.
    const content = await generateContent({
      topic: input.topic,
      tone: input.tone ?? null,
      length: input.length,
    });
    await pool.query(
      "UPDATE blog_articles SET title = $1, body = $2, excerpt = $3, updated_at = NOW() WHERE id = $4",
      [content.title, content.body, content.excerpt, articleId],
    );

    // 5. Optional featured image.
    let imageUrl: string | null = null;
    let imagePrompt: string | null = null;
    if (input.withImage) {
      const img = await generateImage({ title: content.title, topic: input.topic });
      if (img) {
        imageUrl = img.url;
        imagePrompt = img.prompt;
        await pool.query(
          "UPDATE blog_articles SET image_url = $1, image_prompt = $2, updated_at = NOW() WHERE id = $3",
          [imageUrl, imagePrompt, articleId],
        );
      }
    }

    // 6. Push to WordPress.
    const posted = await postToWp({
      siteUrl: conn.site_url,
      apiKey: conn.api_key,
      title: content.title,
      body: content.body,
      excerpt: content.excerpt,
      status: input.publishStatus,
      imageUrl,
      categoryIds: input.categoryIds,
      tagNames: input.tagNames,
    });

    await pool.query(
      `UPDATE blog_articles
         SET status = 'posted',
             wp_post_id = $1,
             wp_post_url = $2,
             image_url = COALESCE($3, image_url),
             updated_at = NOW()
       WHERE id = $4`,
      [posted.wp_post_id, posted.wp_post_url, posted.image_url, articleId],
    );

    // 7. Charge tokens (only after successful WP post).
    //    Billing fairness: if the user asked for an image but it failed to
    //    generate (DALL·E quota / key missing / network), the article shipped
    //    without one — so we charge the cheaper 5-token rate instead of 10.
    if (!user.is_admin) {
      const imageDelivered = !!(imageUrl || posted.image_url);
      const effectiveCost = input.withImage && imageDelivered
        ? TOKEN_COSTS.BLOG_POST_WITH_IMAGE
        : TOKEN_COSTS.BLOG_POST;
      const reason = input.withImage && imageDelivered ? "blog_post_image" : "blog_post";
      const { ok, balance } = await tryDebitTokens(input.userId, effectiveCost, reason, {
        ref_type: "article",
        ref_id: articleId,
        meta: { requested_image: input.withImage, image_delivered: imageDelivered },
      });
      if (!ok) {
        // Extremely unlikely (we pre-flighted), but if a concurrent job
        // drained the balance between then and now, leave the article on
        // WordPress and surface the discrepancy in the article row so admins
        // can reconcile.
        await pool.query(
          "UPDATE blog_articles SET error = $1, updated_at = NOW() WHERE id = $2",
          [`Posted but couldn't debit ${effectiveCost} tokens (balance ${balance}). Manual reconcile.`, articleId],
        );
      }
    }

    return { articleId };
  } catch (e) {
    const msg = (e as Error).message || String(e);
    await pool.query(
      "UPDATE blog_articles SET status = 'failed', error = $1, updated_at = NOW() WHERE id = $2",
      [msg.slice(0, 500), articleId],
    );
    throw e;
  }
}

/**
 * Map any supported cadence string to a "minutes until next run" number.
 * Returns 0 (caller will use default) if the value is unknown.
 *
 * New canonical values: 10min / 30min / 1h / 2h / 5h / 12h / 24h / 48h.
 * Legacy values (hourly / daily / weekly / monthly) still work so existing
 * rows in the DB don't break — we just don't offer them in the new form.
 */
function cadenceMinutes(cadence: string): number {
  switch ((cadence || "").toLowerCase()) {
    // new canonical values
    case "10min": return 10;
    case "30min": return 30;
    case "1h":    return 60;
    case "2h":    return 120;
    case "5h":    return 300;
    case "12h":   return 720;
    case "24h":   return 1440;
    case "48h":   return 2880;
    // legacy values (kept for back-compat)
    case "hourly":  return 60;
    case "daily":   return 1440;
    case "weekly":  return 10080;
    case "monthly": return 43200; // ~30 days
    default:        return 0;
  }
}

export function computeNextRun(cadence: string, from: Date = new Date()): Date {
  const mins = cadenceMinutes(cadence) || cadenceMinutes("24h");
  return new Date(from.getTime() + mins * 60_000);
}
