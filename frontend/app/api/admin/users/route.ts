import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  // Note: users.id (int) vs crawls user_id — crawls don't have user_id yet,
  // so crawl_count is always 0 for now. Leaving the join pattern ready.
  const r = await pool.query(
    `SELECT id, email, name, is_admin, created_at,
            0::int AS crawl_count
     FROM users
     ORDER BY created_at DESC`,
  );
  return NextResponse.json(r.rows);
}
