import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const r = await pool.query(
    `SELECT domain, platform, hit_count, created_at, updated_at
     FROM scrape_configs ORDER BY updated_at DESC LIMIT 500`,
  );
  return NextResponse.json(r.rows);
}
