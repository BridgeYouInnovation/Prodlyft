"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import { Icons } from "@/components/Icons";

interface DetectResult {
  url: string;
  origin: string;
  platform: string;
  platform_name: string;
  platform_color: string;
  confidence: "high" | "medium" | "low" | "none";
  signals: string[];
  scoreboard: { platform: string; name: string; signals: string[] }[];
  cms: string[];
  analytics: string[];
  active_probes: { shopify_products_json: boolean; woocommerce_store_api: boolean };
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
  none: "No signals matched",
};

const CONFIDENCE_CHIP: Record<string, string> = {
  high: "chip-accent",
  medium: "chip-warn",
  low: "chip",
  none: "chip",
};

export default function PlatformCheckerPage() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/tools/platform-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await r.json()) as DetectResult & { error?: string };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />

      <section className="pt-12 md:pt-[72px] px-4 md:px-12 max-w-[900px] mx-auto">
        <div className="text-center mb-8 md:mb-10">
          <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-line rounded-full text-[11.5px] text-ink-2 mb-5">
            <span className="chip chip-accent h-[18px]">Free tool</span>
            No login required
          </div>
          <h1 className="text-[32px] sm:text-[42px] md:text-[52px] font-[560] leading-[1.05] tracking-tight3 mb-3 md:mb-4 px-2 sm:px-0">
            Store Platform<br className="hidden sm:inline" />
            <span className="text-muted"> Checker</span>
          </h1>
          <p className="text-[14px] md:text-[16px] text-muted max-w-[560px] mx-auto leading-[1.55] px-2 sm:px-0">
            Paste any store URL. We tell you whether it runs on Shopify, WooCommerce, BigCommerce, Squarespace, Wix, Magento, or 8 other platforms — plus the CMS and analytics tags it ships.
          </p>
        </div>

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
            placeholder="store.example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={submitting} className="btn-primary btn-lg w-full sm:w-auto" style={{ height: 44 }}>
            {submitting ? "Checking…" : <>Check <Icons.ArrowRight size={14} /></>}
          </button>
        </form>

        {error && (
          <div className="mt-4 mx-auto max-w-[640px] p-3 rounded-md text-[13px] bg-warn-soft text-warn-ink text-center">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-8 md:mt-10 grid gap-4">
            {/* Hero result */}
            <div className="card p-5 md:p-6">
              <div className="flex items-start gap-4 flex-wrap">
                <div
                  className="w-14 h-14 rounded-lg relative flex-shrink-0"
                  style={{ background: result.platform_color, opacity: result.platform === "none" ? 0.4 : 1 }}
                >
                  <div className="absolute inset-2 rounded-md bg-white/15" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] text-muted uppercase tracking-wider mb-1">Detected platform</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-[24px] md:text-[28px] font-[560] tracking-tight2 break-words">
                      {result.platform_name}
                    </div>
                    <span className={`chip ${CONFIDENCE_CHIP[result.confidence]}`}>
                      {CONFIDENCE_LABEL[result.confidence]}
                    </span>
                  </div>
                  <div className="font-mono text-[12px] text-muted mt-1 break-all">{result.url}</div>
                </div>
              </div>

              {result.signals.length > 0 && (
                <div className="mt-5 pt-4 border-t border-line-2">
                  <div className="text-[11.5px] text-muted uppercase tracking-wider mb-2">
                    Signals matched ({result.signals.length})
                  </div>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {result.signals.map((s) => (
                      <li key={s} className="flex items-start gap-2 text-[12.5px]">
                        <Icons.Check size={12} className="text-accent flex-shrink-0 mt-1" />
                        <span className="text-ink-2">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.platform === "none" && (
                <div className="mt-5 pt-4 border-t border-line-2 text-[13px] text-muted">
                  No e-commerce platform signals matched. The site might be a custom build, a marketing page that doesn't ship cart code on the homepage, or an obfuscated stack we don't recognise.
                </div>
              )}
            </div>

            {/* CMS + analytics */}
            {(result.cms.length > 0 || result.analytics.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="card p-5">
                  <div className="text-[11.5px] text-muted uppercase tracking-wider mb-2">CMS</div>
                  {result.cms.length === 0 ? (
                    <div className="text-[13px] text-muted">No CMS detected separately.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {result.cms.map((c) => (
                        <span key={c} className="chip">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="card p-5">
                  <div className="text-[11.5px] text-muted uppercase tracking-wider mb-2">
                    Analytics &amp; pixels{result.analytics.length > 0 && ` (${result.analytics.length})`}
                  </div>
                  {result.analytics.length === 0 ? (
                    <div className="text-[13px] text-muted">None detected from page source.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {result.analytics.map((a) => (
                        <span key={a} className="chip">{a}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Scoreboard — only show when there's a non-trivial second place */}
            {result.scoreboard.length > 1 && (
              <div className="card p-5">
                <div className="text-[11.5px] text-muted uppercase tracking-wider mb-3">All matches</div>
                <ul className="flex flex-col gap-2">
                  {result.scoreboard.map((row, i) => (
                    <li key={row.platform} className="flex items-center gap-3 text-[13px]">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: i === 0 ? "var(--ink)" : "var(--muted-2)" }}
                      />
                      <span className={i === 0 ? "font-medium text-ink" : "text-ink-2"}>{row.name}</span>
                      <span className="text-muted ml-auto">
                        {row.signals.length} signal{row.signals.length === 1 ? "" : "s"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Active probes */}
            {(result.active_probes.shopify_products_json || result.active_probes.woocommerce_store_api) && (
              <div className="card p-5">
                <div className="text-[11.5px] text-muted uppercase tracking-wider mb-2">Public catalog API</div>
                <div className="text-[13px] text-ink-2 leading-[1.55]">
                  {result.active_probes.shopify_products_json && (
                    <div className="flex items-center gap-2"><Icons.Check size={14} className="text-accent"/> <span><span className="font-mono">/products.json</span> is open — Prodlyft can pull the full catalog.</span></div>
                  )}
                  {result.active_probes.woocommerce_store_api && (
                    <div className="flex items-center gap-2"><Icons.Check size={14} className="text-accent"/> <span>WooCommerce <span className="font-mono">Store API</span> is open — Prodlyft can pull the full catalog.</span></div>
                  )}
                </div>
              </div>
            )}

            {/* Cross-sell CTA */}
            {(result.platform === "shopify" || result.platform === "woocommerce") && (
              <div className="card p-5 text-center">
                <div className="text-[14px] font-[560] mb-1.5">Want every product as a CSV?</div>
                <p className="text-[13px] text-muted mb-4 max-w-[480px] mx-auto leading-[1.55]">
                  Prodlyft pulls the full catalog from this {result.platform_name} store and gives you import-ready Shopify or WooCommerce CSVs.
                </p>
                <Link href={`/?prefill=${encodeURIComponent(result.origin)}`} className="btn-primary btn-lg">
                  Extract this store <Icons.ArrowRight size={14} />
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
          {[
            { n: "01", t: "Pattern matching", d: "We pull the page source and run dozens of rules — CDN fingerprints, generator meta tags, JS globals, theme/plugin paths." },
            { n: "02", t: "Active probes", d: "For Shopify and WooCommerce we go further: a quick hit on /products.json or /wp-json/wc lets us confirm the catalog API works." },
            { n: "03", t: "Scoreboard + signals", d: "Multiple platforms can match. We rank by signal count and tell you exactly what tipped the call." },
          ].map((s) => (
            <div key={s.n} className="card p-5">
              <div className="font-mono text-[11px] text-muted mb-2">{s.n}</div>
              <div className="text-[15px] font-[560] tracking-tight2 mb-1.5">{s.t}</div>
              <div className="text-[13px] text-muted leading-[1.55]">{s.d}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 mb-16 text-center text-[12px] text-muted-2 max-w-[560px] mx-auto leading-[1.55]">
          Detection is based on what the site exposes in its HTML. Sites behind aggressive anti-bot walls (Cloudflare challenges, Akamai) may return little markup and false-negative results.
        </div>
      </section>
    </div>
  );
}
