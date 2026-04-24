"use client";
import Link from "next/link";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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
  const { data: session } = useSession();
  const [crawls, setCrawls] = useState<Crawl[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [quickUrl, setQuickUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const firstName = session?.user?.name?.split(" ")[0]
    || session?.user?.email?.split("@")[0]
    || "there";

  useEffect(() => {
    let alive = true;
    const tick = () => listCrawls(20)
      .then((r) => { if (alive) { setCrawls(r); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
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
  const running = crawls.filter(c => c.status === "processing" || c.status === "pending").length;
  const failed = crawls.filter(c => c.status === "failed").length;
  const done = crawls.filter(c => c.status === "done").length;

  const stats = [
    { label: "Extracts", value: String(crawls.length) },
    { label: "Products pulled", value: totalProducts.toLocaleString() },
    { label: "Running", value: String(running) },
    { label: "Failed", value: String(failed) },
  ];

  return (
    <Shell active="dashboard" crumbs={["Dashboard"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 pt-5 md:pt-7 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4 mb-6 md:mb-7">
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl tracking-tight2 truncate">
              {greeting()}, {firstName}
            </h1>
            <p className="text-[13.5px] mt-1 text-muted">
              {done === 0 && crawls.length === 0
                ? "Paste any store URL to pull its catalog."
                : `${done} extract${done === 1 ? "" : "s"} completed · ${totalProducts.toLocaleString()} product${totalProducts === 1 ? "" : "s"} pulled`}
            </p>
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
              <div className="text-2xl font-[560] tracking-tight2">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="card overflow-hidden min-w-0">
            <div className="px-4 py-3.5 flex items-center gap-2.5">
              <div className="text-sm font-medium">Recent extracts</div>
              {crawls.length > 0 && <span className="chip">{crawls.length}</span>}
              <div className="flex-1" />
              <Link href="/products" className="btn-sm btn-ghost">View all</Link>
            </div>
            {crawls.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4 bg-line-2">
                  <Icons.Box size={20} className="text-muted" />
                </div>
                <div className="text-[14px] font-medium mb-1">
                  {loaded ? "No extracts yet" : "Loading…"}
                </div>
                {loaded && (
                  <>
                    <p className="text-[12.5px] text-muted mb-5 max-w-[340px] mx-auto leading-[1.55]">
                      Pull a full product catalog from any Shopify or WooCommerce store.
                    </p>
                    <Link href="/" className="btn-primary"><Icons.Plus size={14}/> Start your first extract</Link>
                  </>
                )}
              </div>
            ) : (
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
                    {crawls.map((c) => (
                      <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/crawls/${c.id}`)}>
                        <td>
                          <span className="font-mono text-[12px] text-muted">{hostname(c.url)}</span>
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
            )}
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
                <p>For WooCommerce, point at the shop root. Stores that disable the Blocks REST API may fail.</p>
                <p>Pick <b>Other</b> on the <Link href="/" className="underline">new-extract page</Link> for one-off product URLs.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
