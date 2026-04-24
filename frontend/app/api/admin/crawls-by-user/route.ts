import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * Admin aggregate: one row per user with their crawl count, product count,
 * status distribution, and the most-recent crawl timestamp. Plus a final
 * "Orphan" bucket for crawls with NULL user_id (created before the auth gate).
 */
export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const r = await pool.query(
    `SELECT
       u.id            AS user_id,
       u.email         AS user_email,
       u.name          AS user_name,
       u.is_admin      AS user_is_admin,
       COUNT(c.id)::int                                      AS crawl_count,
       COALESCE(SUM(c.total), 0)::int                        AS product_count,
       SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END)::int AS done_count,
       SUM(CASE WHEN c.status = 'failed' THEN 1 ELSE 0 END)::int AS failed_count,
       SUM(CASE WHEN c.status IN ('pending','processing') THEN 1 ELSE 0 END)::int AS running_count,
       MAX(c.created_at)                                     AS last_crawl_at
     FROM crawls c
     LEFT JOIN users u ON u.id = c.user_id
     GROUP BY u.id, u.email, u.name, u.is_admin
     ORDER BY last_crawl_at DESC NULLS LAST`,
  );
  return NextResponse.json(r.rows);
}
