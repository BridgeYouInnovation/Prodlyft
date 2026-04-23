export type JobStatus = "pending" | "processing" | "done" | "failed";

export interface CleanedProduct {
  title: string | null;
  short_description?: string | null;
  description: string | null;
  price: number | null;
  currency: string;
  categories: string[];
  tags?: string[];
  sku: string | null;
  brand?: string | null;
  images: string[];
  in_stock: boolean | null;
  source_url?: string;
}

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  error: string | null;
  result: CleanedProduct | null;
  progress: { step?: string; [k: string]: unknown } | null;
  created_at: string | null;
  updated_at: string | null;
}

const base = "/api";

export async function createImport(url: string): Promise<{ job_id: string }> {
  const r = await fetch(`${base}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(`Import failed: ${r.status} ${await r.text()}`);
  return r.json();
}

export async function getJob(id: string): Promise<Job> {
  const r = await fetch(`${base}/job/${id}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Job lookup failed: ${r.status}`);
  return r.json();
}

export async function listJobs(limit = 20): Promise<Job[]> {
  const r = await fetch(`${base}/jobs?limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Jobs list failed: ${r.status}`);
  return r.json();
}
