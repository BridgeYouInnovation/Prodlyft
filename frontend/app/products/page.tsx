"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { listCrawls, type Crawl } from "@/lib/api";

function hostname(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function StatusChip({ s }: { s: string }) {
  const map: Record<string, string> = {
    done: "chip-accent",
    processing: "chip-warn",
    failed: "",
    pending: "",
  };
  return <span className={`chip ${map[s] ?? ""} capitalize`}>{s}</span>;
}

export default function ExtractsList() {
  const [crawls, setCrawls] = useState<Crawl[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    listCrawls(100)
      .then((r) => { setCrawls(r); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const filtered = crawls.filter((c) => {
    if (!q.trim()) return true;
    return hostname(c.url).includes(q.toLowerCase());
  });

  return (
    <Shell active="extracts" crumbs={["Extracts"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5 md:mb-6">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Extracts</h1>
            <p className="text-[13.5px] text-muted mt-1">
              {crawls.length === 0 && loaded ? "Nothing here yet." : `${crawls.length} total`}
            </p>
          </div>
          <div className="sm:flex-1" />
          <Link href="/" className="btn-primary self-start sm:self-auto"><Icons.Plus size={14}/> New extract</Link>
        </div>

        {crawls.length > 0 && (
          <div className="mb-4 max-w-[360px]">
            <div className="relative">
              <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
              <input className="input pl-8" placeholder="Search by host" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
        )}

        {!loaded ? (
          <div className="text-muted text-sm py-10 text-center">Loading…</div>
        ) : crawls.length === 0 ? (
          <div className="card px-6 py-16 text-center max-w-[560px] mx-auto">
            <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4 bg-line-2">
              <Icons.Box size={20} className="text-muted" />
            </div>
            <div className="text-[16px] font-[560] mb-2">No extracts yet</div>
            <p className="text-[13px] text-muted mb-6 leading-[1.55]">
              Paste a Shopify or WooCommerce store URL and get every product
              in seconds — plus an import-ready CSV.
            </p>
            <Link href="/" className="btn-primary btn-lg"><Icons.Plus size={14}/> Start your first extract</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
            {filtered.map((c) => (
              <Link key={c.id} href={`/crawls/${c.id}`} className="card p-4 hover:border-ink transition-colors">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="chip capitalize">{c.platform}</span>
                  <span className="chip">{c.total || c.product_count || 0} products</span>
                  <div className="flex-1" />
                  <StatusChip s={c.status} />
                </div>
                <div className="font-mono text-[12px] text-muted truncate mb-3">{hostname(c.url)}</div>
                {c.thumbnails && c.thumbnails.length > 0 ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {c.thumbnails.slice(0, 4).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={i} src={src} alt="" className="rounded border border-line object-cover bg-white" style={{ aspectRatio: "1/1" }} />
                    ))}
                  </div>
                ) : (
                  <div className="ph w-full" style={{ aspectRatio: "4/1", fontSize: 8 }}>
                    {c.status === "failed" ? "EXTRACTION FAILED" : "NO IMAGES"}
                  </div>
                )}
              </Link>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-1 sm:col-span-2 lg:col-span-3 text-center text-muted text-sm py-12">
                No extracts match "{q}".
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
