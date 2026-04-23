"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";
import { createImport } from "@/lib/api";

const logos = ["ALBA", "NORTHWIND", "KOFI", "LUMEN", "PARITY", "FIELDNOTE"];

export default function Landing() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const { job_id } = await createImport(url.trim());
      router.push(`/imports/${job_id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[15px] tracking-tight2">
          <BrandMark /> Prodlyft
        </Link>
        <nav className="hidden lg:flex gap-6 ml-12 text-[13px] text-muted">
          <span>Product</span><span>Integrations</span><span>Pricing</span><span>Docs</span><span>Changelog</span>
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-[13px]">
          <span className="text-muted hidden sm:inline">Sign in</span>
          <Link href="/dashboard" className="btn-primary">Start free</Link>
        </div>
      </header>

      <section className="pt-12 md:pt-[88px] px-4 md:px-12 max-w-[1100px] mx-auto text-center">
        <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-line rounded-full text-[11.5px] text-ink-2 mb-6 md:mb-7">
          <span className="chip chip-accent h-[18px]">New</span>
          <span className="hidden xs:inline">Bulk import from any Shopify store — live</span>
          <span className="xs:hidden">Bulk import from Shopify</span>
        </div>

        <h1 className="text-[40px] sm:text-5xl md:text-6xl lg:text-[64px] font-[560] leading-[1.05] md:leading-[1.02] tracking-tight3 max-w-[900px] mx-auto mb-4 md:mb-[18px]">
          Every product,<br />
          <span className="text-muted">from any URL, in seconds.</span>
        </h1>
        <p className="text-[15px] md:text-[17px] text-muted max-w-[560px] mx-auto mb-8 md:mb-10 leading-[1.5]">
          Prodlyft pulls product data from any storefront, cleans it up, and syncs it to WooCommerce or Shopify. No scraping scripts. No spreadsheets.
        </p>

        <form
          onSubmit={onSubmit}
          className="max-w-[640px] mx-auto bg-white border border-line rounded-xl p-2 flex flex-col sm:flex-row sm:items-center gap-2"
          style={{ boxShadow: "0 1px 2px rgba(14,14,12,0.04), 0 12px 40px -20px rgba(14,14,12,0.15)" }}
        >
          <div className="flex items-center gap-2 px-3 sm:border-r border-line text-muted h-10 sm:h-11">
            <Icons.Link size={15} />
            <span className="font-mono text-[12px]">https://</span>
          </div>
          <input
            className="flex-1 font-mono text-[13.5px] text-ink text-left bg-transparent outline-none px-3 sm:px-0 min-w-0"
            placeholder="northwind-supply.com/products/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary btn-lg w-full sm:w-auto"
            style={{ height: 44 }}
          >
            {submitting ? "Queuing…" : <>Extract <Icons.ArrowRight size={14} /></>}
          </button>
        </form>
        {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}
        <div className="mt-3.5 text-[12px] text-muted-2 flex items-center justify-center gap-2 md:gap-4 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="dot text-accent" /> Live — 1,284 URLs processed today</span>
          <span className="hidden sm:inline">·</span>
          <span>Free for your first 50 products</span>
        </div>

        {/* Preview mock */}
        <div
          className="mt-10 md:mt-[72px] bg-white border border-line rounded-[14px] text-left overflow-hidden"
          style={{ boxShadow: "0 30px 80px -40px rgba(14,14,12,0.25)" }}
        >
          <div className="h-9 border-b border-line flex items-center px-3.5 gap-2 bg-surface2">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-line" />
              <div className="w-2.5 h-2.5 rounded-full bg-line" />
              <div className="w-2.5 h-2.5 rounded-full bg-line" />
            </div>
            <div className="flex-1" />
            <div className="font-mono text-[10px] md:text-[11px] text-muted truncate">app.prodlyft.com/imports/ntwnd-4129</div>
            <div className="flex-1 hidden sm:block" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr] min-h-[320px]">
            <div className="p-5 md:p-7 border-b md:border-b-0 md:border-r border-line">
              <div className="text-[11.5px] text-muted uppercase tracking-wider mb-2.5">Extracted</div>
              <div className="text-[20px] md:text-[22px] font-[560] tracking-tight2 mb-1">Field Notebook · Classic</div>
              <div className="text-[13px] text-muted mb-5">Northwind Supply Co. · SKU FN-0412</div>
              <div className="flex gap-2 mb-5 flex-wrap">
                <span className="chip">Stationery</span>
                <span className="chip">Notebooks</span>
                <span className="chip chip-accent"><span className="dot" /> 4 variants</span>
              </div>
              <div className="text-[13px] text-ink-2 leading-[1.55]">
                Hand-stitched 64-page pocket notebook with recycled kraft cover. Lay-flat binding, acid-free cream paper, rounded corners.
              </div>
              <div className="h-px bg-line my-5" />
              <div className="grid grid-cols-3 gap-4">
                <div><div className="text-[11px] text-muted">Price</div><div className="text-[15px] font-medium">$14.00</div></div>
                <div><div className="text-[11px] text-muted">Compare</div><div className="text-[15px] font-medium text-muted">$18.00</div></div>
                <div><div className="text-[11px] text-muted">Weight</div><div className="text-[15px] font-medium">120 g</div></div>
              </div>
            </div>
            <div className="p-5 md:p-7 bg-surface2">
              <div className="ph w-full mb-2" style={{ aspectRatio: "1/1" }}>NOTEBOOK · 01</div>
              <div className="grid grid-cols-4 gap-2">
                {["02", "03", "04", "05"].map((n) => (
                  <div key={n} className="ph" style={{ aspectRatio: "1/1" }}>{n}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-16 md:mt-20 pt-12 md:pt-[72px] pb-12 px-4 md:px-12 border-t border-line-2">
        <div className="text-center text-[11.5px] text-muted uppercase tracking-wider mb-[22px]">Used by 4,200+ merchants</div>
        <div className="flex justify-center gap-6 md:gap-12 flex-wrap font-mono text-[12px] md:text-[14px] tracking-[0.15em] text-muted-2">
          {logos.map((l) => (<span key={l}>{l}</span>))}
        </div>
      </section>
    </div>
  );
}
