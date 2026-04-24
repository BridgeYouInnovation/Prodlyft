import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const r = await pool.query(
    `SELECT u.id, u.email, u.name, u.is_admin, u.created_at,
            u.plan, u.plan_period_start,
            u.products_used_in_period, u.products_used_total,
            (SELECT COUNT(*)::int FROM crawls c WHERE c.user_id = u.id) AS crawl_count
     FROM users u
     ORDER BY u.created_at DESC`,
  );
  return NextResponse.json(r.rows);
}
