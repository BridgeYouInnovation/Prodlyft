import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/blogger/health — admin-only smoke test for the entire
 * Auto Blogger dependency stack. Hits each external system with the
 * cheapest possible call so a misconfigured env var or expired key shows
 * up immediately instead of mid-article-generation.
 *
 * Checks:
 *   1. OPENROUTER_API_KEY present + valid (1-token chat completion).
 *   2. OPENAI_API_KEY present + valid (list models, no image gen so $0).
 *   3. CRON_SECRET present (Vercel cron headers won't authenticate without it).
 *   4. DB has the token tables (token_packs row count).
 *   5. blog_schedules table reachable + count of currently-enabled rows.
 */

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
  ms?: number;
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const t0 = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - t0 };
}

async function checkOpenRouter(): Promise<CheckResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return { name: "OpenRouter", ok: false, detail: "OPENROUTER_API_KEY env var is not set" };
  const model = process.env.OPENROUTER_BLOGGER_MODEL || "anthropic/claude-sonnet-4.5";
  try {
    const { value: r, ms } = await timed(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://prodlyft.com",
        "X-Title": "Prodlyft Health Check",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: pong" }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(20_000),
    }));
    if (!r.ok) {
      const body = await r.text();
      return { name: "OpenRouter", ok: false, detail: `HTTP ${r.status}: ${body.slice(0, 200)}`, ms };
    }
    const data = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    const reply = data.choices?.[0]?.message?.content?.trim() || "(empty)";
    return {
      name: "OpenRouter",
      ok: true,
      detail: `${model} → ${reply.slice(0, 80)}`,
      ms,
    };
  } catch (e) {
    return { name: "OpenRouter", ok: false, detail: (e as Error).message };
  }
}

async function checkOpenAI(): Promise<CheckResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      name: "OpenAI (images)",
      ok: false,
      detail: "OPENAI_API_KEY not set — articles with image=true will publish without a featured image",
    };
  }
  const configured = process.env.OPENAI_IMAGE_MODEL || "dall-e-3";
  // Probe every known image model so the operator can see which ones the
  // account has access to. OpenAI's /v1/models lists ALL accessible
  // models including image ones; an account that's been migrated off
  // dall-e-3 will only show gpt-image-1 here.
  const CANDIDATES = ["dall-e-3", "dall-e-2", "gpt-image-1"];
  try {
    const { value: r, ms } = await timed(() => fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    }));
    if (!r.ok) {
      const body = await r.text();
      return { name: "OpenAI (images)", ok: false, detail: `HTTP ${r.status}: ${body.slice(0, 200)}`, ms };
    }
    const data = (await r.json()) as { data?: { id: string }[] };
    const available = CANDIDATES.filter((id) => (data.data || []).some((m) => m.id === id));
    const configuredOk = available.includes(configured);

    if (configuredOk) {
      return {
        name: "OpenAI (images)",
        ok: true,
        detail: `using ${configured} · also available: ${available.filter((a) => a !== configured).join(", ") || "(none)"}`,
        ms,
      };
    }
    return {
      name: "OpenAI (images)",
      ok: false,
      detail: available.length > 0
        ? `OPENAI_IMAGE_MODEL=${configured} not in your account. Available: ${available.join(", ")}. Set OPENAI_IMAGE_MODEL=${available[0]} on Vercel.`
        : `No image models available on this OpenAI account — enable Images in platform.openai.com/usage/dashboard. Articles will publish without featured images.`,
      ms,
    };
  } catch (e) {
    return { name: "OpenAI (images)", ok: false, detail: (e as Error).message };
  }
}

async function checkCronSecret(): Promise<CheckResult> {
  const ok = !!process.env.CRON_SECRET;
  return {
    name: "Cron secret",
    ok,
    detail: ok
      ? "CRON_SECRET set (Vercel cron will authenticate)"
      : "CRON_SECRET missing — Vercel's 10-min blog-tick cron will return 401",
  };
}

async function checkDb(): Promise<CheckResult> {
  try {
    const { pool } = await import("@/lib/db");
    const { value: r, ms } = await timed(() => pool.query<{
      packs: string; sched_total: string; sched_enabled: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM token_packs)              AS packs,
         (SELECT COUNT(*)::text FROM blog_schedules)           AS sched_total,
         (SELECT COUNT(*)::text FROM blog_schedules WHERE enabled = TRUE) AS sched_enabled`,
    ));
    const row = r.rows[0];
    return {
      name: "Database",
      ok: true,
      detail: `packs=${row.packs} · schedules=${row.sched_total} (${row.sched_enabled} enabled)`,
      ms,
    };
  } catch (e) {
    return { name: "Database", ok: false, detail: (e as Error).message };
  }
}

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  // Run them in parallel — each one has its own timeout, so the worst case
  // is whichever the slowest external service is.
  const results = await Promise.all([
    checkOpenRouter(),
    checkOpenAI(),
    checkCronSecret(),
    checkDb(),
  ]);

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: okCount === results.length,
    summary: `${okCount}/${results.length} checks passing`,
    checks: results,
    checked_at: new Date().toISOString(),
  });
}
