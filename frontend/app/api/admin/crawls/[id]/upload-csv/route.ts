import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

// Minimal, dependency-free CSV parser — handles quoted fields, embedded commas,
// and escaped quotes. Returns array of rows (arrays of strings).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let i = 0;
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cur += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cur += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { row.push(cur); cur = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 0 && r.some((v) => v.trim() !== ""));
}

function splitList(s: string | undefined | null): string[] {
  if (!s) return [];
  return s.split(/[,|;]/).map((t) => t.trim()).filter(Boolean);
}

function coerceBool(s: string | undefined): boolean | null {
  if (s == null) return null;
  const v = s.trim().toLowerCase();
  if (["1", "true", "yes", "y", "in stock", "instock"].includes(v)) return true;
  if (["0", "false", "no", "n", "out of stock", "outofstock"].includes(v)) return false;
  return null;
}

function coerceNumber(s: string | undefined): number | null {
  if (s == null || s.trim() === "") return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Maps a header name to our canonical product field name.
function canonicalField(h: string): string | null {
  const k = h.trim().toLowerCase();
  const map: Record<string, string> = {
    // Generic
    "title": "title",
    "name": "title",
    "handle": "handle",
    "slug": "handle",
    "sku": "sku",
    "variant sku": "sku",
    "price": "price",
    "regular price": "price",
    "variant price": "price",
    "sale price": "compare_at_price",
    "compare at price": "compare_at_price",
    "compare_at_price": "compare_at_price",
    "variant compare at price": "compare_at_price",
    "currency": "currency",
    "brand": "brand",
    "vendor": "brand",
    "description": "description",
    "body (html)": "description",
    "body": "description",
    "short description": "short_description",
    "short_description": "short_description",
    "category": "categories",
    "categories": "categories",
    "type": "categories",
    "product category": "categories",
    "tags": "tags",
    "images": "images",
    "image src": "image_src_single",
    "in stock?": "in_stock",
    "in_stock": "in_stock",
    "stock_status": "in_stock",
    "source url": "source_url",
    "source_url": "source_url",
    "url": "source_url",
    "permalink": "source_url",
  };
  return map[k] ?? null;
}

interface ParsedRow {
  title?: string;
  handle?: string;
  sku?: string | null;
  price?: number | null;
  compare_at_price?: number | null;
  currency?: string | null;
  brand?: string | null;
  description?: string | null;
  short_description?: string | null;
  categories?: string[];
  tags?: string[];
  images?: string[];
  in_stock?: boolean | null;
  source_url?: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;

  const c = await pool.query("SELECT id FROM crawls WHERE id = $1", [id]);
  if (c.rowCount === 0) return NextResponse.json({ error: "Crawl not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });

  const headerFields = rows[0].map(canonicalField);
  const hasTitle = headerFields.includes("title");
  if (!hasTitle) return NextResponse.json({ error: "CSV must have a 'title' or 'name' column" }, { status: 400 });

  // Shopify exports repeat the handle on image-only rows. Collapse by handle.
  const byHandle = new Map<string, ParsedRow>();
  const out: ParsedRow[] = [];

  for (let ri = 1; ri < rows.length; ri++) {
    const rowObj: ParsedRow = {};
    const imagesFromSingleCol: string[] = [];
    let handle: string | undefined;

    for (let ci = 0; ci < rows[ri].length; ci++) {
      const field = headerFields[ci];
      const raw = rows[ri][ci]?.trim() ?? "";
      if (!field || raw === "") continue;

      switch (field) {
        case "title":                rowObj.title = raw; break;
        case "handle":               rowObj.handle = raw; handle = raw; break;
        case "sku":                  rowObj.sku = raw; break;
        case "price":                rowObj.price = coerceNumber(raw); break;
        case "compare_at_price":     rowObj.compare_at_price = coerceNumber(raw); break;
        case "currency":             rowObj.currency = raw; break;
        case "brand":                rowObj.brand = raw; break;
        case "description":          rowObj.description = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); break;
        case "short_description":    rowObj.short_description = raw; break;
        case "categories":           rowObj.categories = splitList(raw); break;
        case "tags":                 rowObj.tags = splitList(raw); break;
        case "images":               rowObj.images = splitList(raw); break;
        case "image_src_single":     imagesFromSingleCol.push(raw); break;
        case "in_stock":             rowObj.in_stock = coerceBool(raw); break;
        case "source_url":           rowObj.source_url = raw; break;
      }
    }

    if (imagesFromSingleCol.length) {
      rowObj.images = (rowObj.images ?? []).concat(imagesFromSingleCol);
    }

    if (handle && byHandle.has(handle)) {
      // Merge additional image-only rows (Shopify format) into the parent.
      const parent = byHandle.get(handle)!;
      if (rowObj.images?.length) parent.images = (parent.images ?? []).concat(rowObj.images);
      continue;
    }

    if (!rowObj.title) continue;
    if (handle) byHandle.set(handle, rowObj);
    out.push(rowObj);
  }

  if (out.length === 0) return NextResponse.json({ error: "No usable rows in CSV" }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inserted = 0;
    for (const p of out) {
      await client.query(
        `INSERT INTO products (id, crawl_id, title, handle, sku, price, compare_at_price, currency, brand,
                               short_description, description, categories, tags, images, in_stock, source_url)
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          id,
          p.title ?? null,
          p.handle ?? null,
          p.sku ?? null,
          p.price ?? null,
          p.compare_at_price ?? null,
          p.currency ?? "USD",
          p.brand ?? null,
          p.short_description ?? null,
          p.description ?? null,
          JSON.stringify(p.categories ?? []),
          JSON.stringify(p.tags ?? []),
          JSON.stringify(p.images ?? []),
          p.in_stock ?? null,
          p.source_url ?? null,
        ],
      );
      inserted++;
    }
    await client.query(
      "UPDATE crawls SET total = (SELECT COUNT(*) FROM products WHERE crawl_id = $1), updated_at = NOW() WHERE id = $1",
      [id],
    );
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, inserted });
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
}
