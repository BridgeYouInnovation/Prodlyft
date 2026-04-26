import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const r = await pool.query(
    `SELECT s.id, s.user_id, u.email AS user_email,
            s.wp_connection_id, c.site_url, c.site_name,
            s.name, s.topics, s.cadence, s.length_target, s.publish_status,
            s.generate_image, s.enabled, s.next_topic_index,
            s.last_run_at, s.next_run_at, s.created_at, s.updated_at,
            (SELECT COUNT(*)::int FROM blog_articles a WHERE a.schedule_id = s.id) AS article_count
     FROM blog_schedules s
     LEFT JOIN users u ON u.id = s.user_id
     LEFT JOIN wp_connections c ON c.id = s.wp_connection_id
     ORDER BY
       CASE WHEN s.enabled THEN 0 ELSE 1 END,
       s.next_run_at ASC
     LIMIT 500`,
  );
  return NextResponse.json(r.rows);
}
