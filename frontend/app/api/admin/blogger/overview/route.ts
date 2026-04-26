import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const [conns, sched, schedActive, art, art7d, artFailed] = await Promise.all([
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM wp_connections"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM blog_schedules"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM blog_schedules WHERE enabled = TRUE"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM blog_articles"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM blog_articles WHERE created_at > NOW() - INTERVAL '7 days'"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM blog_articles WHERE status = 'failed'"),
  ]);
  const usersWith = await pool.query<{ n: string }>("SELECT COUNT(DISTINCT user_id) AS n FROM wp_connections");

  return NextResponse.json({
    connections: Number(conns.rows[0].n) || 0,
    users_with_wp: Number(usersWith.rows[0].n) || 0,
    schedules: Number(sched.rows[0].n) || 0,
    schedules_active: Number(schedActive.rows[0].n) || 0,
    articles: Number(art.rows[0].n) || 0,
    articles_7d: Number(art7d.rows[0].n) || 0,
    articles_failed: Number(artFailed.rows[0].n) || 0,
  });
}
