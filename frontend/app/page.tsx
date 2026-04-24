"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Icons } from "@/components/Icons";
import { LandingHeader } from "@/components/LandingHeader";
import { createCrawl } from "@/lib/api";

const logos = ["ALBA", "NORTHWIND", "KOFI", "LUMEN", "PARITY", "FIELDNOTE"];

export default function Landing() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Advanced options
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [maxProducts, setMaxProducts] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const hasOptions = (maxProducts.trim() !== "" && Number(maxProducts) > 0) || categoryFilter.trim() !== "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const max = maxProducts.trim() === "" ? null : Math.max(1, Math.floor(Number(maxProducts)));
      const { crawl_id } = await createCrawl(url.trim(), "auto", {
        max_products: Number.isFinite(max as number) ? (max as number) : null,
        category_filter: categoryFilter.trim() || null,
      });
      router.push(`/crawls/${crawl_id}`);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />

      <section className="pt-12 md:pt-[72px] px-4 md:px-12 max-w-[900px] mx-auto text-center">
        <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-line rounded-full text-[11.5px] text-ink-2 mb-6 md:mb-7">
          <span className="chip chip-accent h-[18px]">New</span>
          Scrape any Shopify or WooCommerce store in seconds
        </div>

        <h1 className="text-[30px] sm:text-[42px] md:text-[52px] lg:text-[60px] font-[560] leading-[1.08] md:leading-[1.02] tracking-tight3 mb-4 md:mb-5 px-2 sm:px-0">
          Pull full product catalogs<br className="hidden sm:inline" />
          <span className="text-muted"> from any URL, in seconds.</span>
        </h1>
        <p className="text-[14px] md:text-[17px] text-muted max-w-[560px] mx-auto mb-7 md:mb-10 leading-[1.55] px-2 sm:px-0">
          Paste a store URL. Prodlyft auto-detects the platform, pulls every product, and hands you an import-ready CSV for Shopify or WooCommerce.
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
            placeholder="store.myshopify.com"
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

        {/* Advanced options toggle */}
        <div className="max-w-[640px] mx-auto mt-3">
          <button
            type="button"
            onClick={() => setOptionsOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink transition-colors"
          >
            <Icons.Settings size={12} />
            Advanced options
            {hasOptions && !optionsOpen && <span className="chip chip-accent text-[10px]">active</span>}
            <Icons.ChevronDown
              size={12}
              style={{ transform: optionsOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms" }}
            />
          </button>

          {optionsOpen && (
            <div className="mt-3 bg-white border border-line rounded-xl p-4 md:p-5 text-left">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Max products</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    placeholder="All"
                    className="input"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(e.target.value)}
                  />
                  <div className="text-[11.5px] text-muted-2 mt-1.5 leading-[1.45]">
                    Cap the number of products returned. Leave empty to pull the full catalog.
                  </div>
                </div>
                <div>
                  <label className="label">Only categories containing</label>
                  <input
                    type="text"
                    placeholder="e.g. shoes, apparel, electronics"
                    className="input"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  />
                  <div className="text-[11.5px] text-muted-2 mt-1.5 leading-[1.45]">
                    Case-insensitive keyword matched against each product's categories and tags. Leave empty for all.
                  </div>
                </div>
              </div>

              {hasOptions && (
                <div className="mt-4 pt-4 border-t border-line-2 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                  <span>Will apply:</span>
                  {maxProducts.trim() !== "" && Number(maxProducts) > 0 && (
                    <span className="chip">max {Number(maxProducts).toLocaleString()}</span>
                  )}
                  {categoryFilter.trim() !== "" && (
                    <span className="chip">category ~ "{categoryFilter.trim()}"</span>
                  )}
                  <button
                    type="button"
                    onClick={() => { setMaxProducts(""); setCategoryFilter(""); }}
                    className="ml-auto text-muted-2 hover:text-ink underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="mt-3 text-[12px] text-danger">{error}</div>}
        <div className="mt-4 text-[12px] text-muted-2 flex items-center justify-center gap-2 md:gap-4 flex-wrap">
          <span className="flex items-center gap-1.5"><span className="dot text-accent" /> Public catalogs only — no login required</span>
          <span className="hidden sm:inline">·</span>
          <span>CSV export for Shopify & WooCommerce</span>
        </div>

        {/* How it works */}
        <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
          {[
            { n: "01", t: "Paste the store URL", d: "Works on any Shopify or WooCommerce storefront. A single product URL works too — Prodlyft auto-detects what you pasted." },
            { n: "02", t: "We pull the full catalog", d: "Titles, prices, variants, images, SKUs, categories. Optional filters for max products and category keyword." },
            { n: "03", t: "Download import-ready CSV", d: "Shopify CSV and WooCommerce CSV both supported. Upload straight into the other platform." },
          ].map((s) => (
            <div key={s.n} className="card p-5">
              <div className="font-mono text-[11px] text-muted mb-2">{s.n}</div>
              <div className="text-[15px] font-[560] tracking-tight2 mb-1.5">{s.t}</div>
              <div className="text-[13px] text-muted leading-[1.55]">{s.d}</div>
            </div>
          ))}
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
