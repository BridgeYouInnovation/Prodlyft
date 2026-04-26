import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Provide { enabled: boolean }" }, { status: 400 });
  }
  await pool.query(
    "UPDATE blog_schedules SET enabled = $1, updated_at = NOW() WHERE id = $2",
    [body.enabled, id],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  await pool.query("DELETE FROM blog_schedules WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
