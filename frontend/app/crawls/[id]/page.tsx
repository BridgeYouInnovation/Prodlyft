"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { getCrawl, exportCrawlUrl, type Crawl } from "@/lib/api";

function fmtPrice(p: number | null, currency = "USD") {
  if (p == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(p);
  } catch {
    return `${currency} ${p}`;
  }
}

export default function CrawlDetail() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const { data: session, status: authStatus } = useSession();
  const id = params.id;
  const [crawl, setCrawl] = useState<Crawl | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const signedIn = authStatus === "authenticated" && !!session?.user;

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const c = await getCrawl(id, true);
        if (!alive) return;
        setCrawl(c);
        if (c.status === "done" || c.status === "failed") return;
        setTimeout(tick, 1500);
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message);
      }
    };
    tick();
    return () => { alive = false; };
  }, [id]);

  const filtered = useMemo(() => {
    if (!crawl?.products) return [];
    if (!q.trim()) return crawl.products;
    const needle = q.toLowerCase();
    return crawl.products.filter((p) =>
      (p.title || "").toLowerCase().includes(needle) ||
      (p.sku || "").toLowerCase().includes(needle) ||
      (p.brand || "").toLowerCase().includes(needle)
    );
  }, [crawl, q]);

  const isProcessing = crawl && (crawl.status === "pending" || crawl.status === "processing");
  const progress = crawl?.progress;
  const done = typeof progress?.done === "number" ? progress.done : 0;
  const total = typeof progress?.total === "number" && progress.total ? progress.total : null;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : null;

  return (
    <Shell active="imports" crumbs={["Acme Co.", "Extracts", id.slice(0, 8)]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        {err && <div className="text-[12px] text-danger mb-3">{err}</div>}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-[20px] md:text-[22px]">Extract</h1>
              <span className="chip">{crawl?.platform ?? "…"}</span>
              {crawl?.mode && <span className="chip">{crawl.mode}</span>}
            </div>
            <div className="font-mono text-[11.5px] text-muted break-all">{crawl?.url}</div>
          </div>
          <div className="sm:flex-1" />
          {crawl?.status === "done" && signedIn && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <a href={exportCrawlUrl(id, "shopify")} className="btn flex-1 sm:flex-initial justify-center">
                <Icons.Download size={14}/> Shopify CSV
              </a>
              <a href={exportCrawlUrl(id, "woocommerce")} className="btn-primary flex-1 sm:flex-initial justify-center">
                <Icons.Download size={14}/> Woo CSV
              </a>
            </div>
          )}
        </div>

        {/* Progress */}
        {isProcessing && (
          <div className="card p-4 md:p-6 mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-4 h-4 rounded-full spin-border" style={{ border: "1.5px solid var(--ink)", borderRightColor: "transparent" }} />
              <div className="text-[14px] font-medium">
                {progress?.step === "detecting" && "Detecting platform…"}
                {progress?.step === "fetching" && "Fetching products…"}
                {progress?.step === "parsing" && "Parsing product data…"}
                {progress?.step === "extracting" && "Extracting fields…"}
                {progress?.step === "cleaning" && "Cleaning with AI…"}
                {progress?.step === "saving" && "Saving products…"}
                {!progress?.step && "Starting…"}
              </div>
              <div className="flex-1" />
              <div className="font-mono text-[12px] text-muted">
                {total ? `${done} / ${total}` : `${done} products`}
              </div>
            </div>
            <div className="h-[4px] bg-line-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-ink transition-[width]"
                style={{ width: pct != null ? `${pct}%` : "30%", transition: "width 500ms ease" }}
              />
            </div>
            <div className="mt-2 text-[11.5px] text-muted">
              Catalogs of 500+ products typically take under a minute.
            </div>
          </div>
        )}

        {/* Failure */}
        {crawl?.status === "failed" && (
          <div className="card p-4 md:p-6 mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="chip font-mono" style={{ color: "var(--danger)" }}>FAILED</span>
              <div className="text-[14px] font-medium">Extraction failed</div>
            </div>
            <div className="text-[13px] text-ink-2 whitespace-pre-wrap">{crawl.error || "Unknown error"}</div>
            <div className="mt-3 flex gap-2">
              <Link href="/" className="btn">Start over</Link>
              <Link href="/dashboard" className="btn-ghost">Back to dashboard</Link>
            </div>
          </div>
        )}

        {/* Sign-in gate for anonymous users */}
        {crawl?.status === "done" && !signedIn && authStatus !== "loading" && (
          <div className="card p-5 md:p-7 mb-5 text-center max-w-[560px] mx-auto w-full">
            <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
              <Icons.Sparkle size={22} />
            </div>
            <div className="text-[11.5px] font-mono uppercase tracking-wider text-muted mb-1.5">{crawl.platform} extract</div>
            <h2 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">
              {crawl.products?.length ?? 0} products ready
            </h2>
            <p className="text-[13.5px] text-muted mb-5 leading-[1.55]">
              Sign in to view the full product list and download the Shopify or WooCommerce CSV.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Link
                href={`/signup?callbackUrl=${encodeURIComponent(pathname)}`}
                className="btn-primary btn-lg"
              >
                Create account <Icons.ArrowRight size={14} />
              </Link>
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent(pathname)}`}
                className="btn btn-lg"
              >
                Sign in
              </Link>
            </div>
            <div className="mt-3 text-[11.5px] text-muted-2">
              Free — no credit card required.
            </div>
          </div>
        )}

        {/* Summary + search (signed-in only) */}
        {crawl?.status === "done" && signedIn && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-5">
              <Stat label="Products" value={String(crawl.products?.length ?? 0)} />
              <Stat label="With images" value={String((crawl.products || []).filter(p => (p.images || []).length > 0).length)} />
              <Stat label="With price" value={String((crawl.products || []).filter(p => p.price != null).length)} />
              <Stat label="Platform" value={crawl.platform} />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1 max-w-[360px]">
                <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
                <input
                  className="input pl-8"
                  placeholder="Search title, SKU, brand"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="text-[12px] text-muted whitespace-nowrap">
                {filtered.length} / {crawl.products?.length ?? 0}
              </div>
            </div>

            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>Title</th>
                      <th className="hidden sm:table-cell">SKU</th>
                      <th>Price</th>
                      <th className="hidden md:table-cell">Brand</th>
                      <th className="hidden lg:table-cell">Categories</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 && (
                      <tr><td colSpan={6} className="text-center text-muted py-10">No products matched.</td></tr>
                    )}
                    {filtered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          {p.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.images[0]} alt="" className="w-8 h-8 rounded object-cover border border-line" />
                          ) : (
                            <div className="ph w-8 h-8 rounded" style={{ fontSize: 8 }}>—</div>
                          )}
                        </td>
                        <td className="font-medium text-ink max-w-[240px] truncate">
                          {p.source_url ? (
                            <a href={p.source_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {p.title || "Untitled"}
                            </a>
                          ) : (
                            p.title || "Untitled"
                          )}
                        </td>
                        <td className="hidden sm:table-cell font-mono text-[11.5px] text-muted">{p.sku ?? "—"}</td>
                        <td>
                          <span className="font-medium">{fmtPrice(p.price, p.currency)}</span>
                          {p.compare_at_price && p.compare_at_price !== p.price && (
                            <span className="ml-1.5 text-muted text-[11.5px] line-through">{fmtPrice(p.compare_at_price, p.currency)}</span>
                          )}
                        </td>
                        <td className="hidden md:table-cell text-muted">{p.brand ?? "—"}</td>
                        <td className="hidden lg:table-cell text-muted max-w-[220px] truncate">{(p.categories || []).join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 md:px-4 py-3 md:py-3.5 min-w-0">
      <div className="text-[11px] md:text-[11.5px] text-muted mb-1 md:mb-1.5 truncate">{label}</div>
      <div className="text-[18px] md:text-2xl font-[560] tracking-tight2 capitalize truncate">{value}</div>
    </div>
  );
}
