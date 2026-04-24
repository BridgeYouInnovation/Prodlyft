import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const VALID_STATUSES = new Set(["pending", "processing", "done", "failed"]);

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;

  const c = await pool.query(
    `SELECT id, url, platform, mode, status, error, total
     FROM crawls WHERE id = $1`,
    [id],
  );
  if (c.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = await pool.query(
    `SELECT id, title, sku, price, currency, brand, short_description, description,
            categories, tags, images, source_url, in_stock
     FROM products WHERE crawl_id = $1
     ORDER BY created_at ASC`,
    [id],
  );

  return NextResponse.json({ ...c.rows[0], products: p.rows });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string; error?: string | null };

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.status) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    sets.push(`status = $${sets.length + 1}`);
    vals.push(body.status);
  }
  if ("error" in body) {
    sets.push(`error = $${sets.length + 1}`);
    vals.push(body.error ?? null);
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE crawls SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  await pool.query("DELETE FROM crawls WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
