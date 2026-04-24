export type CrawlStatus = "pending" | "processing" | "done" | "failed";
export type Platform = "shopify" | "woocommerce" | "other" | "auto";
export type CrawlMode = "catalog" | "single";

export interface ProductRow {
  id: string;
  title: string | null;
  handle: string | null;
  sku: string | null;
  brand: string | null;
  price: number | null;
  compare_at_price: number | null;
  currency: string;
  short_description: string | null;
  description: string | null;
  categories: string[];
  tags: string[];
  images: string[];
  variants: Record<string, unknown>[];
  in_stock: boolean | null;
  source_url: string | null;
}

export interface Crawl {
  id: string;
  url: string;
  platform: string;
  mode: CrawlMode;
  status: CrawlStatus;
  error: string | null;
  progress: { step?: string; done?: number; total?: number | null; [k: string]: unknown } | null;
  total: number;
  product_count?: number;
  thumbnails?: string[];
  products?: ProductRow[];
  created_at: string | null;
  updated_at: string | null;
}

const base = "/api";

export interface CrawlOptions {
  max_products?: number | null;
  category_filter?: string | null;
}

export async function createCrawl(
  url: string,
  platform: Platform = "auto",
  options: CrawlOptions = {},
): Promise<{ crawl_id: string; platform: string; mode: CrawlMode }> {
  const r = await fetch(`${base}/crawl`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, platform, ...options }),
  });
  if (!r.ok) throw new Error(`Crawl failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getCrawl(id: string, includeProducts = true): Promise<Crawl> {
  const r = await fetch(`${base}/crawl/${id}?include_products=${includeProducts}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Crawl lookup failed: ${r.status}`);
  return r.json();
}

export async function listCrawls(limit = 20): Promise<Crawl[]> {
  const r = await fetch(`${base}/crawls?limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`List failed: ${r.status}`);
  return r.json();
}

export function exportCrawlUrl(id: string, format: "shopify" | "woocommerce"): string {
  return `${base}/crawl/${id}/export?format=${format}`;
}
