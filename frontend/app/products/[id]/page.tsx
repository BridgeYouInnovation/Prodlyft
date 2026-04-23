"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Icons } from "@/components/Icons";
import { getJob, type CleanedProduct, type Job } from "@/lib/api";

export default function ProductEditor() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [form, setForm] = useState<CleanedProduct | null>(null);
  const [dest, setDest] = useState<"Shopify" | "Woo" | "Storefront">("Shopify");

  useEffect(() => {
    getJob(id).then((j) => { setJob(j); if (j.result) setForm(j.result); }).catch(() => {});
  }, [id]);

  if (!job || !form) {
    return (
      <div className="min-h-screen flex">
        <Sidebar active="products" />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar crumbs={["Acme Co.", "Products", id.slice(0, 8)]} />
          <div className="flex-1 grid place-items-center text-muted text-sm">Loading…</div>
        </div>
      </div>
    );
  }

  const update = <K extends keyof CleanedProduct>(k: K, v: CleanedProduct[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const originalPrice = job.result?.price ?? null;
  const changes = [
    form.title !== job.result?.title && { k: "Title", was: job.result?.title, now: form.title, reason: "Manual edit" },
    form.price !== originalPrice && { k: "Price", was: originalPrice != null ? `$${originalPrice}` : "—", now: `$${form.price}`, reason: "Manual edit" },
  ].filter(Boolean) as { k: string; was: string; now: string; reason: string }[];

  return (
    <div className="min-h-screen flex">
      <Sidebar active="products" />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          crumbs={["Acme Co.", "Products", form.title ?? id.slice(0, 8)]}
          right={
            <div className="flex items-center gap-2">
              <span className="chip chip-accent"><span className="dot" /> Saved locally</span>
              <button className="btn btn-sm">Discard</button>
              <button className="btn-sm btn-primary">Save & sync</button>
            </div>
          }
        />
        <div className="flex-1 overflow-auto grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="px-8 py-7 border-r border-line flex flex-col gap-5">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-[20px]">{form.title ?? "Untitled"}</h1>
                <span className="chip">Draft</span>
              </div>
              <div className="text-[12px] text-muted font-mono break-all">
                {id.slice(0, 8)} · Imported from {new URL(job.url).hostname}
              </div>
            </div>

            <div className="card p-[18px]">
              <div className="text-[13px] font-medium mb-3.5">Basics</div>
              <div className="grid gap-3">
                <div>
                  <label className="label">Title</label>
                  <input className="input" value={form.title ?? ""} onChange={(e) => update("title", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">SKU</label>
                    <input className="input input-mono" value={form.sku ?? ""} onChange={(e) => update("sku", e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Brand</label>
                    <input className="input" value={form.brand ?? ""} onChange={(e) => update("brand", e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="label">Short description</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={form.short_description ?? ""}
                    onChange={(e) => update("short_description", e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Description</label>
                  <textarea
                    className="input"
                    rows={6}
                    value={form.description ?? ""}
                    onChange={(e) => update("description", e.target.value)}
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    <button className="btn-sm btn-ghost"><Icons.Sparkle size={11}/> Rewrite</button>
                    <button className="btn-sm btn-ghost">Shorten</button>
                    <button className="btn-sm btn-ghost">Add bullets</button>
                  </div>
                </div>
              </div>
            </div>

            <div className="card p-[18px]">
              <div className="flex items-center mb-3.5">
                <div className="text-[13px] font-medium">Pricing</div>
                <div className="flex-1" />
                <span className="chip">Currency: {form.currency || "USD"}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-[13px] text-muted">$</span>
                    <input
                      className="input pl-6"
                      value={form.price ?? ""}
                      onChange={(e) => update("price", e.target.value === "" ? null : Number(e.target.value))}
                    />
                  </div>
                </div>
              </div>
              <div className="mt-2.5 text-[11.5px] text-muted">Original price: {originalPrice != null ? `$${originalPrice}` : "—"}</div>
            </div>

            <div className="card p-[18px]">
              <div className="text-[13px] font-medium mb-3.5">Organization</div>
              <div>
                <label className="label">Categories & tags</label>
                <div className="flex gap-1.5 flex-wrap p-1.5 border border-line rounded-md min-h-9 items-center">
                  {(form.categories || []).map((c) => (
                    <span key={c} className="chip">
                      {c}
                      <Icons.X size={10} className="ml-0.5 cursor-pointer" onClick={() => update("categories", form.categories.filter((x) => x !== c))} />
                    </span>
                  ))}
                  {(form.tags || []).map((c) => (
                    <span key={c} className="chip chip-ghost">
                      {c}
                      <Icons.X size={10} className="ml-0.5 cursor-pointer" onClick={() => update("tags", (form.tags || []).filter((x) => x !== c))} />
                    </span>
                  ))}
                  <span className="text-[12px] text-muted-2 px-1.5">Add…</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#F6F4EC] px-8 py-7 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Icons.Eye size={14} className="text-muted" />
              <span className="text-[12.5px] text-muted">Live preview</span>
              <div className="flex-1" />
              <div className="flex border border-line rounded-md bg-white p-0.5">
                {(["Shopify", "Woo", "Storefront"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setDest(t)}
                    className="px-2.5 py-1 text-[11.5px] rounded-sm"
                    style={{
                      background: dest === t ? "var(--ink)" : "transparent",
                      color: dest === t ? "var(--bg)" : "var(--muted)",
                      fontWeight: dest === t ? 500 : 400,
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-line overflow-hidden">
              <div className="h-7 border-b border-line bg-surface2 flex items-center px-3 font-mono text-[10.5px] text-muted">
                {dest === "Shopify" ? "acme.myshopify.com" : dest === "Woo" ? "wp.acmehome.com" : "preview"}/products/{(form.sku || id).toLowerCase()}
              </div>
              <div className="grid grid-cols-2 p-5 gap-5">
                <div>
                  {form.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.images[0]} alt="" className="w-full rounded border border-line object-cover mb-1.5" style={{ aspectRatio: "1/1" }} />
                  ) : (
                    <div className="ph w-full mb-1.5" style={{ aspectRatio: "1/1" }}>NO IMAGE</div>
                  )}
                  <div className="grid grid-cols-4 gap-1">
                    {(form.images || []).slice(1, 5).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" className="rounded border border-line object-cover" style={{ aspectRatio: "1/1" }} />
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10.5px] text-muted uppercase tracking-wider">{form.brand ?? "Product"}</div>
                  <div className="text-[18px] font-[560] tracking-tight2 mt-1">{form.title ?? "Untitled"}</div>
                  <div className="flex items-baseline gap-2 mt-2.5">
                    <span className="text-[18px] font-medium">{form.price != null ? `$${form.price}` : "—"}</span>
                  </div>
                  <button className="btn-primary btn-lg w-full mt-3.5">Add to cart</button>
                  {form.short_description && <div className="mt-3.5 text-[12px] text-ink-2 leading-[1.5]">{form.short_description}</div>}
                </div>
              </div>
            </div>

            {changes.length > 0 && (
              <div className="bg-white rounded-lg border border-line p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-medium mb-2.5">
                  <Icons.Branch size={13} /> Changes from source
                </div>
                {changes.map((d, i) => (
                  <div key={i} className={`grid gap-2.5 py-2 text-[12px] ${i === 0 ? "" : "border-t border-line-2"}`} style={{ gridTemplateColumns: "90px 1fr auto" }}>
                    <div className="text-muted">{d.k}</div>
                    <div>
                      <span className="text-muted line-through">{String(d.was ?? "—")}</span>
                      <span className="text-muted-2 mx-1.5">→</span>
                      <span className="font-medium">{d.now}</span>
                    </div>
                    <span className="chip chip-ghost text-[10px]">{d.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
