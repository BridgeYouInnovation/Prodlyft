import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { domain } = await params;
  const r = await pool.query(
    `SELECT domain, platform, config, hit_count, created_at, updated_at
     FROM scrape_configs WHERE domain = $1`,
    [decodeURIComponent(domain)],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ domain: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { domain } = await params;
  await pool.query("DELETE FROM scrape_configs WHERE domain = $1", [decodeURIComponent(domain)]);
  return NextResponse.json({ ok: true });
}
