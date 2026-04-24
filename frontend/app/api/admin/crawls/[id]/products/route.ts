import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = typeof body.title === "string" ? body.title : null;
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const c = await pool.query("SELECT 1 FROM crawls WHERE id = $1", [id]);
  if (c.rowCount === 0) return NextResponse.json({ error: "Crawl not found" }, { status: 404 });

  await pool.query(
    `INSERT INTO products (id, crawl_id, title, sku, price, currency, brand,
                           short_description, description, categories, tags, images,
                           in_stock, source_url)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      id,
      title,
      body.sku ?? null,
      body.price ?? null,
      body.currency ?? "USD",
      body.brand ?? null,
      body.short_description ?? null,
      body.description ?? null,
      JSON.stringify(body.categories ?? []),
      JSON.stringify(body.tags ?? []),
      JSON.stringify(body.images ?? []),
      typeof body.in_stock === "boolean" ? body.in_stock : null,
      body.source_url ?? null,
    ],
  );
  await pool.query("UPDATE crawls SET total = (SELECT COUNT(*) FROM products WHERE crawl_id = $1), updated_at = NOW() WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
