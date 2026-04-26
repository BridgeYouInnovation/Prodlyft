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
    `SELECT id, user_id, site_url, site_name, wp_version, status,
            last_ping_at, created_at, updated_at
     FROM wp_connections WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return NextResponse.json(r.rows);
}
