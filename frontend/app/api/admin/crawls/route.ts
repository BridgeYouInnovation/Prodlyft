import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const r = await pool.query(
    `SELECT id, url, platform, mode, status, total, created_at, updated_at
     FROM crawls
     ORDER BY created_at DESC
     LIMIT 500`,
  );
  return NextResponse.json(r.rows);
}
