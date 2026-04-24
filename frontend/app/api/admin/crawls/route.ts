import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const r = await pool.query(
    `SELECT c.id, c.url, c.platform, c.mode, c.status, c.total,
            c.created_at, c.updated_at, c.user_id,
            u.email AS user_email
     FROM crawls c
     LEFT JOIN users u ON u.id = c.user_id
     ORDER BY c.created_at DESC
     LIMIT 500`,
  );
  return NextResponse.json(r.rows);
}
