"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Icons } from "@/components/Icons";

interface AdminProduct {
  id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
  currency: string;
  brand: string | null;
  short_description: string | null;
  description: string | null;
  categories: string[];
  tags: string[];
  images: string[];
  source_url: string | null;
  in_stock: boolean | null;
}

interface AdminCrawlDetail {
  id: string;
  url: string;
  platform: string;
  mode: string;
  status: string;
  error: string | null;
  total: number;
  products: AdminProduct[];
}

export default function AdminCrawlEditor() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminCrawlDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const r = await fetch(`/api/admin/crawls/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e) { setErr((e as Error).message); }
  }

  useEffect(() => { load(); }, [id]);

  async function delProduct(pid: string) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/admin/products/${pid}`, { method: "DELETE" });
    await load();
  }

  async function updateField(pid: string, field: keyof AdminProduct, value: unknown) {
    await fetch(`/api/admin/products/${pid}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  }

  async function addProduct() {
    const title = prompt("Product title?");
    if (!title) return;
    await fetch(`/api/admin/crawls/${id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    await load();
  }

  async function uploadCsv(file: File) {
    setUploading(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/admin/crawls/${id}/upload-csv`, { method: "POST", body: fd });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      setMsg(`Upload failed: ${body.error || r.statusText}`);
    } else {
      setMsg(`Imported ${body.inserted} products.`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  }

  async function markDone() {
    if (!confirm("Mark this extract as done?")) return;
    await fetch(`/api/admin/crawls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "done" }),
    });
    await load();
  }

  if (!data) {
    return (
      <div className="flex-1 grid place-items-center text-muted text-sm">
        {err ? err : "Loading…"}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <Link href="/admin/extracts" className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1 mb-2">
        ← Back to extracts
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
        <div>
          <h1 className="text-[20px] md:text-[24px] font-[560] tracking-tight2 mb-1">Extract editor</h1>
          <div className="font-mono text-[11.5px] text-muted break-all">{data.url}</div>
          <div className="flex gap-2 mt-2">
            <span className="chip capitalize">{data.platform}</span>
            <span className="chip">{data.mode}</span>
            <span className="chip capitalize">{data.status}</span>
          </div>
          {data.error && <div className="mt-2 text-[12px] text-danger">{data.error}</div>}
        </div>
        <div className="sm:flex-1" />
        <div className="flex flex-wrap gap-2">
          <button className="btn-sm" onClick={addProduct}><Icons.Plus size={12}/> Add product</button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => e.target.files?.[0] && uploadCsv(e.target.files[0])}
          />
          <button className="btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading…" : <><Icons.Upload size={12}/> Upload CSV</>}
          </button>
          {data.status !== "done" && (
            <button className="btn-sm btn-primary" onClick={markDone}>Mark done</button>
          )}
        </div>
      </div>

      {msg && <div className="mb-4 p-3 rounded-md text-[12.5px] bg-surface2 border border-line">{msg}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}></th>
                <th>Title</th>
                <th>SKU</th>
                <th>Price</th>
                <th className="hidden md:table-cell">Categories</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.products.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted py-10">
                  No products yet. Use <b>Add product</b> or <b>Upload CSV</b>.
                </td></tr>
              )}
              {data.products.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.images[0]} alt="" className="w-8 h-8 rounded object-cover border border-line" />
                    ) : (
                      <div className="ph w-8 h-8 rounded" style={{ fontSize: 8 }}>—</div>
                    )}
                  </td>
                  <td>
                    <input
                      defaultValue={p.title ?? ""}
                      onBlur={(e) => e.target.value !== (p.title ?? "") && updateField(p.id, "title", e.target.value)}
                      className="w-full bg-transparent font-medium text-ink outline-none border-b border-transparent focus:border-line py-1 min-w-[160px]"
                    />
                  </td>
                  <td>
                    <input
                      defaultValue={p.sku ?? ""}
                      onBlur={(e) => e.target.value !== (p.sku ?? "") && updateField(p.id, "sku", e.target.value)}
                      className="w-full bg-transparent font-mono text-[11.5px] text-muted outline-none border-b border-transparent focus:border-line py-1 min-w-[100px]"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={p.price ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        if (v !== p.price) updateField(p.id, "price", v);
                      }}
                      className="w-[90px] bg-transparent outline-none border-b border-transparent focus:border-line py-1"
                    />
                  </td>
                  <td className="hidden md:table-cell text-muted max-w-[220px] truncate">
                    {(p.categories || []).join(", ") || "—"}
                  </td>
                  <td>
                    <button onClick={() => delProduct(p.id)} className="btn-sm btn-ghost text-danger">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 text-[11.5px] text-muted leading-[1.55]">
        Edits save on blur. Upload CSV accepts either our Shopify/Woo export format or a generic one with columns:{" "}
        <span className="font-mono">title, sku, price, description, short_description, brand, categories, tags, images, in_stock, source_url</span>.
        Categories, tags, and images are comma- or pipe-separated.
      </div>
    </div>
  );
}
