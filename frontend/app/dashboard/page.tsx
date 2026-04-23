"use client";
import Link from "next/link";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { listCrawls, createCrawl, type Crawl } from "@/lib/api";

function hostname(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.max(0, Math.floor(d))}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} hr ago`;
  if (d < 172800) return "Yesterday";
  return `${Math.floor(d / 86400)}d ago`;
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { label: string; cls: string; dot: string }> = {
    done:       { label: "Done",       cls: "chip-accent", dot: "var(--accent)" },
    pending:    { label: "Queued",     cls: "",            dot: "var(--muted-2)" },
    processing: { label: "Running",    cls: "chip-warn",   dot: "oklch(0.65 0.13 70)" },
    failed:     { label: "Failed",     cls: "",            dot: "var(--danger)" },
  };
  const m = map[s] ?? map.pending;
  return (
    <span className={`chip ${m.cls}`}>
      <span className="dot" style={{ color: m.dot }} />
      {m.label}
    </span>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const [crawls, setCrawls] = useState<Crawl[]>([]);
  const [quickUrl, setQuickUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => listCrawls(20).then((r) => alive && setCrawls(r)).catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  async function quickSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setSubmitting(true);
    try {
      const { crawl_id } = await createCrawl(quickUrl.trim(), "auto");
      router.push(`/crawls/${crawl_id}`);
    } catch {
      setSubmitting(false);
    }
  }

  const totalProducts = crawls.reduce((a, c) => a + (c.total || c.product_count || 0), 0);
  const stats = [
    { label: "Extracts this month", value: String(crawls.length), delta: `+${crawls.filter(c => c.status === "done").length}`, trend: "up" },
    { label: "Products pulled", value: String(totalProducts), delta: "", trend: "up" },
    { label: "Running", value: String(crawls.filter(c => c.status === "processing" || c.status === "pending").length), delta: "", trend: "flat" },
    { label: "Failed", value: String(crawls.filter(c => c.status === "failed").length), delta: "", trend: "down" },
  ];

  return (
    <Shell active="dashboard" crumbs={["Acme Co.", "Dashboard"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 pt-5 md:pt-7 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 md:mb-7">
          <div>
            <h1 className="text-xl md:text-2xl tracking-tight2">Good afternoon, Sam</h1>
            <p className="text-[13.5px] mt-1 text-muted">Here's what's happening across your stores today.</p>
          </div>
          <div className="sm:flex-1" />
          <div className="flex gap-2">
            <Link href="/" className="btn-primary"><Icons.Plus size={14}/> New extract</Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {stats.map((s, i) => (
            <div key={i} className="card px-4 py-3.5">
              <div className="text-[11.5px] text-muted mb-1.5">{s.label}</div>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl font-[560] tracking-tight2">{s.value}</div>
                <div className={`text-[11.5px] ${s.trend === "up" ? "text-accent-ink" : "text-muted"}`}>{s.delta}</div>
              </div>
              <svg viewBox="0 0 100 24" className="w-full h-6 mt-1.5 overflow-visible">
                <polyline
                  points={Array.from({ length: 12 }).map((_, j) => {
                    const x = j * (100 / 11);
                    const base = 12 + Math.sin(i * 2 + j / 2) * 5 + (i === 3 ? -j * 0.3 : j * 0.5);
                    return `${x},${24 - base}`;
                  }).join(" ")}
                  fill="none" stroke="var(--ink)" strokeWidth="1.2" opacity="0.6"
                />
              </svg>
            </div>
          ))}
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="card overflow-hidden min-w-0">
            <div className="px-4 py-3.5 flex items-center gap-2.5">
              <div className="text-sm font-medium">Recent extracts</div>
              <span className="chip">{crawls.length}</span>
              <div className="flex-1" />
              <button className="btn-sm btn-ghost"><Icons.Sort size={12}/> Newest</button>
            </div>
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th className="hidden sm:table-cell">Platform</th>
                    <th>Products</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {crawls.length === 0 && (
                    <tr><td colSpan={5} className="text-center text-muted py-10">No extracts yet. Paste a store URL to start.</td></tr>
                  )}
                  {crawls.map((c) => (
                    <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/crawls/${c.id}`)}>
                      <td>
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex -space-x-1.5 flex-shrink-0">
                            {(c.thumbnails || []).slice(0, 3).map((src, i) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img key={i} src={src} alt="" className="w-6 h-6 rounded object-cover border border-line bg-white" />
                            ))}
                            {(!c.thumbnails || c.thumbnails.length === 0) && (
                              <div className="ph w-6 h-6 rounded" style={{ fontSize: 8 }}>—</div>
                            )}
                          </div>
                          <span className="font-mono text-[11.5px] text-muted truncate">{hostname(c.url)}</span>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell capitalize">{c.platform}</td>
                      <td className="font-medium">{c.total || c.product_count || 0}</td>
                      <td><StatusPill s={c.status} /></td>
                      <td className="hidden md:table-cell text-muted">{timeAgo(c.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <form onSubmit={quickSubmit} className="card p-4">
              <div className="flex items-center gap-1.5 text-[13px] font-medium mb-1">
                <Icons.Link size={13} /> Quick extract
              </div>
              <p className="text-[12px] text-muted mb-2.5">Paste any store URL — platform auto-detected.</p>
              <input
                className="input input-mono"
                placeholder="store.myshopify.com"
                value={quickUrl}
                onChange={(e) => setQuickUrl(e.target.value)}
              />
              <button type="submit" disabled={submitting} className="btn-primary btn-sm w-full mt-2">
                {submitting ? "Queuing…" : "Extract catalog"}
              </button>
            </form>

            <div className="card p-4">
              <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5">
                <Icons.Sparkle size={13} className="text-accent" /> Tips
              </div>
              <div className="text-[12.5px] text-muted leading-[1.55] space-y-2">
                <p>For Shopify, the root domain is enough — e.g. <span className="font-mono">store.myshopify.com</span>.</p>
                <p>For WordPress/WooCommerce, point at the shop root. Stores that disable the Blocks REST API may fail.</p>
                <p>Pick <b>Other</b> on the landing for one-off product URLs.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
