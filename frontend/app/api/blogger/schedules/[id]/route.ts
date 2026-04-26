import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

async function ownedBy(id: string, userId: number) {
  const r = await pool.query("SELECT * FROM blog_schedules WHERE id = $1 AND user_id = $2", [id, userId]);
  if (r.rowCount === 0) return null;
  return r.rows[0];
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const row = await ownedBy(id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  const row = await ownedBy(id, userId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of ["name", "tone", "length_target", "cadence", "publish_status"] as const) {
    if (typeof body[k] === "string") {
      sets.push(`${k} = $${sets.length + 1}`);
      vals.push(body[k]);
    }
  }
  if (typeof body.enabled === "boolean") {
    sets.push(`enabled = $${sets.length + 1}`);
    vals.push(body.enabled);
  }
  if (typeof body.generate_image === "boolean") {
    sets.push(`generate_image = $${sets.length + 1}`);
    vals.push(body.generate_image);
  }
  if (Array.isArray(body.topics)) {
    sets.push(`topics = $${sets.length + 1}::jsonb`);
    vals.push(JSON.stringify((body.topics as string[]).map(String).filter(Boolean)));
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  sets.push("updated_at = NOW()");
  vals.push(id);
  await pool.query(`UPDATE blog_schedules SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await params;
  await pool.query("DELETE FROM blog_schedules WHERE id = $1 AND user_id = $2", [id, userId]);
  return NextResponse.json({ ok: true });
}
