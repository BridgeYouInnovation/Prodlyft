import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const r = await pool.query(
    `SELECT a.id, a.user_id, u.email AS user_email,
            a.topic, a.title, a.status, a.publish_status,
            a.wp_post_id, a.wp_post_url, a.image_url, a.error,
            a.created_at, a.updated_at,
            c.site_url AS site_url, c.site_name AS site_name,
            s.name AS schedule_name
     FROM blog_articles a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN wp_connections c ON c.id = a.wp_connection_id
     LEFT JOIN blog_schedules s ON s.id = a.schedule_id
     ORDER BY a.created_at DESC
     LIMIT 500`,
  );
  return NextResponse.json(r.rows);
}
