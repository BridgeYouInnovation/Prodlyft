import { pool, findUserById } from "./db";
import { LENGTH_MIN_WORDS, LENGTH_WORDS, type LengthTarget, type PublishStatus } from "./blogger";
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

// Article-writer model. Three sources, most-specific first:
//   1. OPENROUTER_BLOGGER_MODEL — set this if you want a different model
//      for blog posts than for the AI scraper / cleanup.
//   2. OPENROUTER_MODEL — the project-wide default used by the backend
//      too. Keeping the name in sync means setting it once covers
//      everything.
//   3. Hardcoded fallback — gemini-2.5-flash. Fast and cheap; good
//      enough for medium-length posts.
const ARTICLE_MODEL =
  process.env.OPENROUTER_BLOGGER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "google/gemini-2.5-flash";

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

/**
 * Pull a clean JSON object out of whatever the model returned. LLMs are
 * fond of wrapping JSON in markdown fences, prefixing with prose ("Here's
 * your article:"), trailing commas, or producing un-escaped newlines
 * inside strings. We try a sequence of progressively-tolerant strategies
 * before giving up.
 */
function extractJsonObject<T>(raw: string): T | null {
  if (!raw || !raw.trim()) return null;

  // Strategy 1: straight parse.
  try { return JSON.parse(raw) as T; } catch { /* try harder */ }

  // Strategy 2: strip markdown code fences (```json ... ``` or ``` ... ```).
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()) as T; } catch { /* fall through */ }
  }

  // Strategy 3: find the first balanced top-level {...} block. Tracks
  // string boundaries + escape sequences so braces inside strings don't
  // throw off the depth counter.
  const balanced = findBalancedJson(raw);
  if (balanced) {
    try { return JSON.parse(balanced) as T; } catch { /* try cleanup */ }

    // Strategy 4: cheap cleanups for the most common LLM quirks —
    // trailing commas, smart-quotes, BOM. We deliberately do NOT strip
    // control chars: tab/newline/CR inside JSON strings must be escaped,
    // but stripping them blindly would corrupt valid HTML in `body`.
    // If the model emitted unescaped control chars, JSON.parse below
    // fails and we give up — better than silent corruption.
    const cleaned = balanced
      .replace(/,(\s*[}\]])/g, "$1")        // trailing commas
      .replace(/[‘’]/g, "'")      // curly single quotes
      .replace(/[“”]/g, '"')      // curly double quotes
      .replace(/^\uFEFF/, "");           // BOM
    try { return JSON.parse(cleaned) as T; } catch { /* give up */ }
  }
  return null;
}

/** Walk `raw`, find the first {...} block where braces balance. */
function findBalancedJson(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

interface OpenRouterResponse {
  choices?: {
    message?: { content?: string };
    finish_reason?: string;
  }[];
  error?: { message?: string };
}

/**
 * Call OpenRouter once. Bubbles up HTTP / parse problems with specific
 * messages — the caller decides whether to retry.
 */
async function callArticleModel(
  userMsg: string,
  systemPrompt: string,
): Promise<{ content: string; finishReason: string | undefined }> {
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
        { role: "system", content: systemPrompt },
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
  const body = (await r.json()) as OpenRouterResponse;
  if (body.error?.message) {
    throw new Error(`OpenRouter error: ${body.error.message}`);
  }
  const choice = body?.choices?.[0];
  return {
    content: choice?.message?.content || "",
    finishReason: choice?.finish_reason,
  };
}

export async function generateContent(input: GenerateContentInput): Promise<GeneratedContent> {
  const words = LENGTH_WORDS[input.length] ?? 1200;
  const minWords = LENGTH_MIN_WORDS[input.length] ?? 1000;
  const userMsg = [
    `Topic / Keyword: ${input.topic}`,
    `Tone: ${input.tone?.trim() || "professional and engaging"}`,
    `Target length: ~${words} words`,
    // Explicit minimum stops the LLM from happily turning a "long" post
    // into 1100 words and calling it done. We re-state this as a hard
    // floor so the model can't average it down.
    `HARD MINIMUM: at least ${minWords} words. Posts below this will be rejected.`,
    `SEO: treat the topic above as the primary keyword/phrase. Use it naturally in the title, the first paragraph, and at least one H2.`,
  ].join("\n");

  // Two-pass strategy: first call uses the normal system prompt. If we
  // can't parse JSON out of the reply, retry once with an extra reminder
  // appended. Empirically this fixes the cases where Gemini/Claude got
  // chatty and wrapped the JSON in prose or markdown.
  const STRICTER_REMINDER =
    "\n\nCRITICAL: Output MUST be a single raw JSON object starting with { and ending with }. " +
    "No markdown code fences. No prose before or after. No explanation. " +
    "All strings must be valid JSON (escape any internal double quotes with \\\").";

  let lastRaw = "";
  let lastFinish: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = attempt === 0 ? SYSTEM_PROMPT : SYSTEM_PROMPT + STRICTER_REMINDER;
    const { content, finishReason } = await callArticleModel(userMsg, prompt);
    lastRaw = content;
    lastFinish = finishReason;

    // Truncation is unrecoverable — the JSON is incomplete by definition.
    // Fail fast with a useful message; don't waste a retry.
    if (finishReason === "length") {
      throw new Error(
        `AI response truncated by token limit (finish_reason=length, ${content.length} chars). ` +
          "Try a shorter Length setting or split the topic.",
      );
    }

    const parsed = extractJsonObject<GeneratedContent>(content);
    if (parsed && parsed.title && parsed.body) {
      return parsed;
    }
    if (parsed && (!parsed.title || !parsed.body)) {
      // Parsed but schema was wrong — log this case and let the retry try.
      console.warn(
        `[blogger] attempt ${attempt + 1}: JSON parsed but missing fields ` +
          `(title=${!!parsed.title}, body=${!!parsed.body})`,
      );
    } else {
      console.warn(
        `[blogger] attempt ${attempt + 1}: could not parse JSON from ${content.length}-char response. ` +
          `Preview: ${content.slice(0, 160).replace(/\s+/g, " ")}…`,
      );
    }
  }

  // Both attempts exhausted. Surface a useful error with a snippet of
  // what we got so admin debugging is easier than "AI did not return JSON".
  const preview = lastRaw.slice(0, 200).replace(/\s+/g, " ");
  throw new Error(
    `AI failed to return valid JSON after 2 attempts ` +
      `(finish_reason=${lastFinish ?? "?"}, ${lastRaw.length} chars). ` +
      `Got: "${preview}${lastRaw.length > 200 ? "…" : ""}"`,
  );
}

/**
 * Returns a public URL for the generated featured image. Returns null if
 * OPENAI_API_KEY isn't configured OR the image API errors (article still
 * publishes without an image; cost falls back to the 5-token rate).
 *
 * The model is configurable via OPENAI_IMAGE_MODEL because OpenAI has been
 * deprecating dall-e-3 in favor of gpt-image-1 for new accounts. Default
 * stays dall-e-3 for back-compat — accounts that still have it work
 * unchanged, accounts that don't can flip the env var to gpt-image-1.
 *
 * `size`/`quality`/`response_format` accepted by dall-e-3 differ slightly
 * from gpt-image-1, so when we detect a non-dall-e model we drop those
 * fields and let OpenAI pick defaults.
 */
/**
 * generateImage result. dall-e-3 returns a 1-hour signed URL; gpt-image-1
 * returns base64 in the response body, no URL endpoint. Callers handle
 * both by checking which field is set.
 *
 * When image generation fails we return an object with only `error`
 * populated (no url/b64) so the caller can persist the reason on the
 * article row for the admin dashboard to surface.
 */
export interface GeneratedImage {
  prompt: string;
  url?: string;          // dall-e-3 path — fetchable for the next hour
  b64?: string;          // gpt-image-1 path — raw base64 (no data: prefix)
  error?: string;        // populated when the OpenAI call failed
}

export async function generateImage(opts: { title: string; topic: string }): Promise<GeneratedImage | null> {
  const key = envOpenAIKey();
  if (!key) {
    return { prompt: "", error: "OPENAI_API_KEY not set on the frontend" };
  }

  const model = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
  const isDallE = model.startsWith("dall-e");

  const prompt =
    `Photographic featured image for a blog post titled "${opts.title}". ` +
    `Subject relates to: ${opts.topic}. ` +
    "Wide 16:9 composition, natural lighting, magazine-quality. No text or logos overlaid.";

  // dall-e-3 wants size/quality/response_format. gpt-image-1 takes a
  // different set (size accepted, no quality, no response_format), so the
  // safe cross-model body is just {model, prompt, n} with dall-e extras
  // added only when the model starts with "dall-e".
  const body: Record<string, unknown> = {
    model,
    prompt,
    n: 1,
  };
  if (isDallE) {
    body.size = "1792x1024";
    body.quality = "standard";
    body.response_format = "url";
  }

  let r: Response;
  try {
    r = await fetch(OPENAI_IMAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    console.error("[blogger] image gen network error:", msg);
    return { prompt, error: `Network error calling OpenAI: ${msg.slice(0, 200)}` };
  }

  if (!r.ok) {
    const rawBody = (await r.text()).slice(0, 500);
    // Try to pull the OpenAI error code + message out of the JSON body
    // so the admin dashboard shows something actionable ("billing hard
    // limit reached" instead of "HTTP 400").
    let friendly = `OpenAI HTTP ${r.status}`;
    try {
      const parsed = JSON.parse(rawBody) as { error?: { message?: string; code?: string } };
      const oaErr = parsed.error;
      if (oaErr?.code === "billing_hard_limit_reached") {
        friendly =
          "OpenAI billing hard limit reached — raise or clear it at " +
          "https://platform.openai.com/settings/organization/limits then " +
          "regenerate this article. No token was charged.";
      } else if (oaErr?.code === "content_policy_violation" || oaErr?.code === "moderation_blocked") {
        friendly = `OpenAI content policy blocked this image: ${oaErr.message?.slice(0, 200) || oaErr.code}`;
      } else if (oaErr?.code === "insufficient_quota") {
        friendly = "OpenAI account has no remaining quota. Add credit at https://platform.openai.com/settings/organization/billing/overview";
      } else if (oaErr?.code === "invalid_api_key" || oaErr?.code === "unauthorized") {
        friendly = "OpenAI rejected our API key — rotate OPENAI_API_KEY on Vercel.";
      } else if (oaErr?.message) {
        friendly = `OpenAI ${r.status}: ${oaErr.message.slice(0, 200)}`;
      }
    } catch {
      /* body wasn't JSON; keep the generic HTTP message */
    }
    console.error("[blogger] image gen failed:", r.status, rawBody);
    return { prompt, error: friendly };
  }
  const data = (await r.json()) as { data?: { url?: string; b64_json?: string }[] };
  const first = data?.data?.[0];
  if (first?.url) return { url: first.url, prompt };
  if (first?.b64_json) return { b64: first.b64_json, prompt };
  return { prompt, error: "OpenAI returned no url and no b64_json in the response" };
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

    // 5. Optional featured image. dall-e-3 hands back a URL we forward
    //    straight to WordPress. gpt-image-1 returns base64 instead — we
    //    persist it in image_b64 and forward our own proxy URL so the WP
    //    plugin (which only knows how to sideload from URLs) can fetch it.
    let imageUrl: string | null = null;
    let imagePrompt: string | null = null;
    let imageError: string | null = null;
    if (input.withImage) {
      const img = await generateImage({ title: content.title, topic: input.topic });
      if (img?.url) {
        imageUrl = img.url;
        imagePrompt = img.prompt;
        await pool.query(
          "UPDATE blog_articles SET image_url = $1, image_prompt = $2, image_error = NULL, updated_at = NOW() WHERE id = $3",
          [imageUrl, imagePrompt, articleId],
        );
      } else if (img?.b64) {
        const base = process.env.PUBLIC_BASE_URL || "https://prodlyft.com";
        // MUST end in .png — WordPress's wp_check_filetype() rejects
        // sideloads with no recognised extension and silently drops
        // the featured image. This bit us on all pre-2026-07-04
        // gpt-image-1 articles (proxy used to end in /data).
        imageUrl = `${base}/api/blogger/image/${articleId}/featured.png`;
        imagePrompt = img.prompt;
        await pool.query(
          "UPDATE blog_articles SET image_url = $1, image_prompt = $2, image_b64 = $3, image_error = NULL, updated_at = NOW() WHERE id = $4",
          [imageUrl, imagePrompt, img.b64, articleId],
        );
      } else if (img?.error) {
        // Image gen failed but article can still publish text-only.
        // Persist the reason so the admin dashboard surfaces "OpenAI
        // billing limit reached" / "content policy violation" / etc.
        // instead of leaving a mystery blank thumbnail.
        imageError = img.error;
        await pool.query(
          "UPDATE blog_articles SET image_error = $1, updated_at = NOW() WHERE id = $2",
          [imageError, articleId],
        );
        console.warn(`[blogger] article ${articleId} image failed: ${imageError}`);
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

    // Mark posted + replace our proxy URL with WP's permanent media-library
    // URL. Only clear image_b64 once we've CONFIRMED the sideload worked
    // (posted.image_url is the WP attachment URL — populated only when
    // media_handle_sideload succeeded). If WP failed to sideload, keep
    // the b64 around so the /regenerate-image repair endpoint can retry
    // the attach step without redoing OpenAI.
    await pool.query(
      `UPDATE blog_articles
         SET status = 'posted',
             wp_post_id = $1,
             wp_post_url = $2,
             image_url = COALESCE($3, image_url),
             image_b64 = CASE WHEN $3::text IS NULL THEN image_b64 ELSE NULL END,
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
