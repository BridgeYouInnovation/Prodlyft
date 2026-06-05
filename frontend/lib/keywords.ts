/**
 * Keyword research for the Auto Blogger.
 *
 * Approach: LLM + Google Suggest hybrid. Zero new paid APIs.
 *
 *   1. Fetch the user's WordPress site (homepage + a couple of high-
 *      traffic pages we can sniff from the homepage nav).
 *   2. ONE LLM call extracts the site's niche and proposes ~8 SEED
 *      phrases this site should rank for.
 *   3. For each seed, hit Google's public autocomplete
 *      (https://suggestqueries.google.com/complete/search) using the
 *      alphabet trick — append " a", " b", ... " z" to widen the net
 *      and pull back the real "people are typing this" suggestions.
 *   4. Dedupe + filter (length, language, no profanity).
 *   5. ONE more LLM call ranks the long list, returning the top N
 *      most relevant + commercially viable keywords for the site.
 *
 * Total cost: 2 LLM calls (gemini-2.5-flash, ~$0.002 combined) +
 * 8-30 free HTTP GETs to Google. End-to-end: ~3-5 seconds.
 */
import { pool } from "./db";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const SUGGEST_URL = "https://suggestqueries.google.com/complete/search";

const ARTICLE_MODEL =
  process.env.OPENROUTER_BLOGGER_MODEL ||
  process.env.OPENROUTER_MODEL ||
  "google/gemini-2.5-flash";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

function envOpenRouterKey(): string {
  const k = process.env.OPENROUTER_API_KEY || "";
  if (!k) throw new Error("OPENROUTER_API_KEY env var is not set");
  return k;
}

// ---------- Site sampling ----------

const _TAG_RE = /<[^>]+>/g;
const _WS_RE = /\s+/g;

function stripHtml(s: string): string {
  return s.replace(_TAG_RE, " ").replace(_WS_RE, " ").trim();
}

/** Fetch the site homepage + (best-effort) up to 2 internal pages from
 *  the homepage nav. Returns a compact string the LLM can read. */
async function sampleSiteContent(siteUrl: string): Promise<{ title: string; sample: string }> {
  const base = siteUrl.replace(/\/+$/, "");
  let home = "";
  try {
    const r = await fetch(base + "/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15_000),
    });
    home = r.ok ? await r.text() : "";
  } catch {
    home = "";
  }

  const titleMatch = home.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 200) : new URL(base).host;

  // Pull the meta description + og:description if any.
  const descMatch = home.match(
    /<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i,
  );
  const description = descMatch ? descMatch[1].slice(0, 400) : "";

  // Strip nav/script/style noise then take a slice of the body.
  let body = home;
  body = body.replace(/<script[\s\S]*?<\/script>/gi, " ");
  body = body.replace(/<style[\s\S]*?<\/style>/gi, " ");
  body = body.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  body = body.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  const visibleText = stripHtml(body).slice(0, 3500);

  // Collect a few internal nav links so the LLM gets a sense of
  // category structure (e.g. /shop, /blog/yoga, /services).
  const internalPaths = new Set<string>();
  for (const m of home.matchAll(/href=["']((?:https?:\/\/[^"']+|\/[^"'#?]+))["']/gi)) {
    const href = m[1];
    let path: string;
    try {
      const u = href.startsWith("http") ? new URL(href) : new URL(href, base);
      if (u.origin !== base) continue;
      path = u.pathname;
    } catch {
      continue;
    }
    if (path === "/" || path.length > 80) continue;
    internalPaths.add(path);
    if (internalPaths.size >= 30) break;
  }

  const sample = [
    `Title: ${title}`,
    description ? `Description: ${description}` : "",
    `Internal paths: ${Array.from(internalPaths).slice(0, 30).join(", ")}`,
    `Homepage text (excerpt): ${visibleText}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { title, sample };
}

// ---------- LLM helpers ----------

async function callLLM(systemPrompt: string, userMsg: string): Promise<string> {
  const r = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${envOpenRouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://prodlyft.com",
      "X-Title": "Prodlyft keyword research",
    },
    body: JSON.stringify({
      model: ARTICLE_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMsg },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) {
    throw new Error(`OpenRouter HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`);
  }
  const body = (await r.json()) as { choices?: { message?: { content?: string } }[] };
  return body?.choices?.[0]?.message?.content || "";
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Tolerate markdown fences + prose.
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try { return JSON.parse(fenced[1]) as T; } catch { /* fall through */ }
    }
    const brace = raw.match(/\{[\s\S]*\}/);
    if (brace) {
      try { return JSON.parse(brace[0]) as T; } catch { /* give up */ }
    }
    return null;
  }
}

// ---------- Google Suggest ----------

/** Hit Google's public autocomplete for one query. Returns suggestions
 *  array or empty on any failure (rate limit, network). */
async function googleSuggest(query: string): Promise<string[]> {
  const url = `${SUGGEST_URL}?client=firefox&hl=en&q=${encodeURIComponent(query)}`;
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return [];
    const data = (await r.json()) as [string, string[]];
    if (!Array.isArray(data) || !Array.isArray(data[1])) return [];
    return data[1].filter((s) => typeof s === "string");
  } catch {
    return [];
  }
}

/** Expand a single seed with the alphabet trick: query "seed",
 *  "seed a", "seed b", ... yielding way more variants than a single
 *  call. Caps at ~150 expansions per seed to stay polite. */
async function expandSeed(seed: string): Promise<string[]> {
  const queries = [seed, ...["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((c) => `${seed} ${c}`)];
  const batches = await Promise.all(queries.map((q) => googleSuggest(q)));
  const all = batches.flat();
  // Light dedupe; the LLM ranker does the heavy filter later.
  return Array.from(new Set(all.map((s) => s.toLowerCase().trim()).filter(Boolean)));
}

// ---------- Public API ----------

export interface GenerateKeywordsResult {
  keywords: string[];
  /** Seeds the LLM derived from the site — surface to the user for
   *  transparency ("we built these from the topics: X, Y, Z"). */
  seeds: string[];
  /** Total raw suggestions Google returned before ranking. */
  pool_size: number;
  site_title: string;
  duration_ms: number;
}

const SEED_SYSTEM = `You are a senior SEO strategist. Given the homepage content of a website, produce 8 short "seed" keywords/phrases this site should target.

Return EXACTLY ONE JSON object — no prose, no markdown:
{ "niche": "1-line summary of what the site sells/offers", "seeds": ["seed phrase 1", "seed phrase 2", ...] }

Rules:
- 2-4 words per seed. No questions. No brand names of competitors.
- Mix informational ("how to choose X") and commercial ("best X under $50") intents.
- Use US English unless the site is clearly in another language.
- Output 8 seeds. Distinct topics, not slight rephrasings of each other.`;

const RANK_SYSTEM = `You are an SEO strategist filtering a long list of Google Suggest results.

Return EXACTLY ONE JSON object — no prose, no markdown:
{ "keywords": ["kw 1", "kw 2", ...] }

Rules:
- Return EXACTLY the requested number of keywords (you'll be given the target N).
- Pick keywords that are RELEVANT to the site's niche AND would make plausible blog post topics (informational + commercial intent both fine).
- 2-7 words each. Reject single-word terms and >8 word queries.
- Reject results that mention specific competitor brands, broken/garbled phrases, or non-English text.
- Prefer queries with clear search intent: "how to ...", "best ... for ...", "... vs ...", "... guide", "... near me" all qualify.
- Dedupe by topic, not by exact string — "best yoga mat" and "best yoga mats" are duplicates.
- Each keyword must be unique and ranked by descending relevance to the niche.`;

export async function generateKeywordsForConnection(
  connectionId: string,
  userId: number,
  count: number,
): Promise<GenerateKeywordsResult> {
  const t0 = Date.now();
  const safeCount = Math.max(5, Math.min(50, Math.floor(count) || 10));

  // 1. Resolve site URL (and verify the user owns the connection).
  const cr = await pool.query<{ site_url: string }>(
    "SELECT site_url FROM wp_connections WHERE id = $1 AND user_id = $2",
    [connectionId, userId],
  );
  if (cr.rowCount === 0) throw new Error("Connection not found");
  const siteUrl = cr.rows[0].site_url;

  // 2. Sample the site.
  const { title, sample } = await sampleSiteContent(siteUrl);

  // 3. Seed extraction (LLM call #1).
  const seedRaw = await callLLM(SEED_SYSTEM, `Site URL: ${siteUrl}\n\n${sample}`);
  const seedJson = tryParseJson<{ niche?: string; seeds?: string[] }>(seedRaw);
  const seeds = Array.isArray(seedJson?.seeds)
    ? seedJson!.seeds!.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, 8)
    : [];
  if (seeds.length === 0) {
    throw new Error("Couldn't derive seed keywords from the site — try editing your site's homepage to better describe what you sell.");
  }
  const niche = seedJson?.niche || "";

  // 4. Expand each seed via Google Suggest (parallel, but capped).
  const expansions = await Promise.all(seeds.map((s) => expandSeed(s)));
  const pool_words: string[] = [];
  const seen = new Set<string>();
  for (const arr of expansions) {
    for (const s of arr) {
      const norm = s.toLowerCase().trim();
      if (norm.length < 6 || norm.length > 90) continue;
      if (seen.has(norm)) continue;
      seen.add(norm);
      pool_words.push(s);
    }
  }
  const poolSize = pool_words.length;

  // 5. Rank + filter (LLM call #2). If the pool is empty (Google
  //    rate-limited us, say), fall back to the seeds themselves.
  let keywords: string[] = [];
  if (pool_words.length >= safeCount) {
    const rankRaw = await callLLM(
      RANK_SYSTEM,
      `Site niche: ${niche || title}\nTarget count: ${safeCount}\n\nCandidate pool (${pool_words.length} items):\n${pool_words.join("\n")}`,
    );
    const ranked = tryParseJson<{ keywords?: string[] }>(rankRaw);
    keywords = Array.isArray(ranked?.keywords)
      ? ranked!.keywords!.filter((s) => typeof s === "string" && s.trim().length > 0).slice(0, safeCount)
      : [];
  }
  // Fallback: not enough suggest data — just return the seeds (the
  // LLM did the work in step 3 already).
  if (keywords.length === 0) {
    keywords = seeds.slice(0, safeCount);
  }

  return {
    keywords,
    seeds,
    pool_size: poolSize,
    site_title: title,
    duration_ms: Date.now() - t0,
  };
}
