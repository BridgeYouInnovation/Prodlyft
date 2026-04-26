import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/admin/cron/run — admin-only manual trigger of the blogger
 * cron tick. Saves the admin from waiting up to 60 minutes when testing
 * a new schedule.
 */
export async function POST(req: Request) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const url = new URL(req.url);
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server." },
      { status: 500 },
    );
  }
  const tickUrl = `${url.origin}/api/cron/blog-tick`;
  const r = await fetch(tickUrl, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await r.json().catch(() => ({}));
  return NextResponse.json({ status: r.status, body });
}
