import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const r = await pool.query(
    `SELECT a.*, c.site_url AS site_url, c.site_name AS site_name,
            s.name AS schedule_name
     FROM blog_articles a
     LEFT JOIN wp_connections c ON c.id = a.wp_connection_id
     LEFT JOIN blog_schedules s ON s.id = a.schedule_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [id, userId],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(r.rows[0]);
}
