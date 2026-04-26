import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

function newId(): string {
  const buf = crypto.getRandomValues(new Uint8Array(9));
  return "wp_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeSite(input: string): string | null {
  const t = (input || "").trim().replace(/\/+$/, "");
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

interface PingResponse {
  ok?: boolean;
  plugin_version?: string;
  site_name?: string;
  site_url?: string;
  wp_version?: string;
}

/**
 * POST /api/blogger/connect — body { site_url, api_key }
 * Pings the user's WordPress site through the plugin, saves the
 * connection if the ping succeeds.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { site_url?: string; api_key?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const siteUrl = normalizeSite(body.site_url || "");
  const apiKey = (body.api_key || "").trim();
  if (!siteUrl) return NextResponse.json({ error: "Enter a valid site URL" }, { status: 400 });
  if (!apiKey || apiKey.length < 24) {
    return NextResponse.json({ error: "API key looks too short — generate one in Settings → Prodlyft Publisher" }, { status: 400 });
  }

  // Probe the plugin.
  let ping: PingResponse | null = null;
  try {
    const r = await fetch(`${siteUrl}/wp-json/prodlyft/v1/ping`, {
      headers: {
        "X-Prodlyft-Key": apiKey,
        "Accept": "application/json",
        "User-Agent": "Prodlyft-Blogger/1.0",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (r.status === 401) {
      return NextResponse.json({ error: "API key was rejected by your site." }, { status: 401 });
    }
    if (r.status === 404) {
      return NextResponse.json(
        { error: "The Prodlyft Publisher plugin doesn't seem active on this site (no /wp-json/prodlyft/v1/ endpoint)." },
        { status: 404 },
      );
    }
    if (!r.ok) {
      return NextResponse.json({ error: `Site responded HTTP ${r.status}` }, { status: 502 });
    }
    ping = (await r.json()) as PingResponse;
    if (!ping.ok) {
      return NextResponse.json({ error: "Plugin replied without OK status." }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Couldn't reach the site: ${(e as Error).message}` }, { status: 502 });
  }

  // Upsert. One user can have many sites; multiple users could in theory all
  // connect to the same site (e.g. an agency). We key by (user_id, site_url).
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM wp_connections WHERE user_id = $1 AND site_url = $2",
    [userId, siteUrl],
  );
  let id: string;
  if (existing.rowCount && existing.rows[0]?.id) {
    id = existing.rows[0].id;
    await pool.query(
      `UPDATE wp_connections
       SET api_key = $1, site_name = $2, wp_version = $3,
           status = 'active', last_ping_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [apiKey, ping.site_name ?? null, ping.wp_version ?? null, id],
    );
  } else {
    id = newId();
    await pool.query(
      `INSERT INTO wp_connections
        (id, user_id, site_url, site_name, api_key, wp_version, status, last_ping_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())`,
      [id, userId, siteUrl, ping.site_name ?? null, apiKey, ping.wp_version ?? null],
    );
  }

  return NextResponse.json({
    id,
    site_url: siteUrl,
    site_name: ping.site_name ?? null,
    wp_version: ping.wp_version ?? null,
  });
}
