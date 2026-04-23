import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const hasUrl = !!process.env.DATABASE_URL;
  const hostHint = process.env.DATABASE_URL?.split("@")[1]?.split("/")[0] ?? null;
  try {
    const ping = await pool.query("SELECT 1 as ok");
    const cols = await pool.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'users' ORDER BY ordinal_position`,
    );
    return NextResponse.json({
      ok: true,
      hasDatabaseUrl: hasUrl,
      host: hostHint,
      ping: ping.rows[0],
      usersColumns: cols.rows,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        hasDatabaseUrl: hasUrl,
        host: hostHint,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
