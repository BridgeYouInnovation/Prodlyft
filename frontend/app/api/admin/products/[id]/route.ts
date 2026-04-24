import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const SCALAR = new Set([
  "title", "sku", "brand", "currency",
  "short_description", "description", "source_url",
  "price", "compare_at_price", "in_stock",
]);
const JSON_FIELDS = new Set(["categories", "tags", "images", "variants"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (SCALAR.has(k)) {
      sets.push(`${k} = $${sets.length + 1}`);
      vals.push(v);
    } else if (JSON_FIELDS.has(k)) {
      sets.push(`${k} = $${sets.length + 1}::jsonb`);
      vals.push(JSON.stringify(v ?? []));
    }
  }
  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  vals.push(id);
  await pool.query(`UPDATE products SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const r = await pool.query("DELETE FROM products WHERE id = $1 RETURNING crawl_id", [id]);
  const crawlId = r.rows[0]?.crawl_id;
  if (crawlId) {
    await pool.query("UPDATE crawls SET total = (SELECT COUNT(*) FROM products WHERE crawl_id = $1), updated_at = NOW() WHERE id = $1", [crawlId]);
  }
  return NextResponse.json({ ok: true });
}
