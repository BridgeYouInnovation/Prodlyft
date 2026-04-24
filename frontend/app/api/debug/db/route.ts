import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { auth } from "@/auth";

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
    const admins = await pool.query<{ id: number; email: string; is_admin: boolean; has_password: boolean }>(
      `SELECT id, email, is_admin, (password IS NOT NULL) AS has_password
       FROM users WHERE is_admin = TRUE ORDER BY id`,
    );
    const session = await auth();
    return NextResponse.json({
      ok: true,
      hasDatabaseUrl: hasUrl,
      host: hostHint,
      ping: ping.rows[0],
      usersColumns: cols.rows,
      admins: admins.rows,
      session: session
        ? {
            user: session.user,
            expires: session.expires,
          }
        : null,
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
