import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const r = await pool.query(
    `SELECT a.id, a.topic, a.tone, a.title, a.excerpt, a.status, a.publish_status,
            a.wp_post_id, a.wp_post_url, a.image_url, a.error,
            a.created_at, a.updated_at,
            c.site_url AS site_url, c.site_name AS site_name,
            s.name AS schedule_name
     FROM blog_articles a
     LEFT JOIN wp_connections c ON c.id = a.wp_connection_id
     LEFT JOIN blog_schedules s ON s.id = a.schedule_id
     WHERE a.user_id = $1
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [userId],
  );
  return NextResponse.json(r.rows);
}
