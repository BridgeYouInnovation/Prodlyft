import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  await pool.query(
    "DELETE FROM wp_connections WHERE id = $1 AND user_id = $2",
    [id, userId],
  );
  return NextResponse.json({ ok: true });
}
