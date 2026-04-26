import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const r = await pool.query(
    `SELECT wc.id, wc.user_id, u.email AS user_email,
            wc.site_url, wc.site_name, wc.wp_version, wc.status,
            wc.last_ping_at, wc.created_at,
            (SELECT COUNT(*)::int FROM blog_schedules s WHERE s.wp_connection_id = wc.id) AS schedule_count,
            (SELECT COUNT(*)::int FROM blog_articles a WHERE a.wp_connection_id = wc.id) AS article_count
     FROM wp_connections wc
     LEFT JOIN users u ON u.id = wc.user_id
     ORDER BY wc.created_at DESC
     LIMIT 500`,
  );
  return NextResponse.json(r.rows);
}
