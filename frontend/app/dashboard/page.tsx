"use client";
import Link from "next/link";
import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Icons } from "@/components/Icons";
import { listJobs, createImport, type Job } from "@/lib/api";

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
    done:       { label: "Synced",     cls: "chip-accent", dot: "var(--accent)" },
    pending:    { label: "Queued",     cls: "",            dot: "var(--muted-2)" },
    processing: { label: "Processing", cls: "chip-warn",   dot: "oklch(0.65 0.13 70)" },
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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quickUrl, setQuickUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () => listJobs(20).then((r) => alive && setJobs(r)).catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  async function quickSubmit(e: FormEvent) {
    e.preventDefault();
    if (!quickUrl.trim()) return;
    setSubmitting(true);
    try {
      const { job_id } = await createImport(quickUrl.trim());
      router.push(`/imports/${job_id}`);
    } catch {
      setSubmitting(false);
    }
  }

  const stats = [
    { label: "Imports this month", value: String(jobs.length), delta: `+${jobs.filter(j => j.status === "done").length}`, trend: "up" },
    { label: "Products synced", value: String(jobs.filter(j => j.status === "done").length), delta: "", trend: "up" },
    { label: "Processing", value: String(jobs.filter(j => j.status === "processing" || j.status === "pending").length), delta: "", trend: "flat" },
    { label: "Failed", value: String(jobs.filter(j => j.status === "failed").length), delta: "", trend: "down" },
  ];

  return (
    <div className="min-h-screen flex">
      <Sidebar active="dashboard" />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={["Acme Co.", "Dashboard"]} />
        <div className="flex-1 overflow-auto px-8 pt-7 pb-10">
          <div className="flex items-start mb-7">
            <div>
              <h1 className="text-2xl tracking-tight2">Good afternoon, Sam</h1>
              <p className="text-[13.5px] mt-1 text-muted">Here's what's happening across your stores today.</p>
            </div>
            <div className="flex-1" />
            <div className="flex gap-2">
              <button className="btn"><Icons.Download size={14}/> Export</button>
              <Link href="/imports/new" className="btn-primary"><Icons.Plus size={14}/> New import</Link>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3 mb-6">
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

          <div className="grid gap-5" style={{ gridTemplateColumns: "1fr 320px" }}>
            <div className="card">
              <div className="px-4 py-3.5 flex items-center gap-2.5">
                <div className="text-sm font-medium">Recent imports</div>
                <span className="chip">{jobs.length}</span>
                <div className="flex-1" />
                <button className="btn-sm btn-ghost"><Icons.Filter size={12}/> All statuses</button>
                <button className="btn-sm btn-ghost"><Icons.Sort size={12}/> Newest</button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}></th>
                    <th>Product</th>
                    <th>Source</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-muted py-10">No imports yet. Paste a URL on the right to start.</td></tr>
                  )}
                  {jobs.map((r) => (
                    <tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/imports/${r.id}`)}>
                      <td>
                        {r.result?.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.result.images[0]} alt="" className="w-7 h-7 rounded object-cover border border-line" />
                        ) : (
                          <div className="ph w-7 h-7 rounded" style={{ fontSize: 8 }}>{r.id.slice(0, 4).toUpperCase()}</div>
                        )}
                      </td>
                      <td className="font-medium text-ink">{r.result?.title ?? <span className="text-muted">—</span>}</td>
                      <td><span className="font-mono text-[11.5px] text-muted">{hostname(r.url)}</span></td>
                      <td><StatusPill s={r.status} /></td>
                      <td className="text-muted">{timeAgo(r.updated_at)}</td>
                      <td><Icons.Dots size={14} className="text-muted-2"/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4">
              <form onSubmit={quickSubmit} className="card p-4">
                <div className="flex items-center gap-1.5 text-[13px] font-medium mb-1">
                  <Icons.Link size={13} /> Quick import
                </div>
                <p className="text-[12px] text-muted mb-2.5">Paste any product URL.</p>
                <input
                  className="input input-mono"
                  placeholder="https://..."
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                />
                <div className="flex gap-1.5 mt-2">
                  <button type="submit" disabled={submitting} className="btn-primary btn-sm flex-1">{submitting ? "Queuing…" : "Extract"}</button>
                  <button type="button" className="btn btn-sm">Bulk CSV</button>
                </div>
              </form>

              <div className="card p-4">
                <div className="flex items-center mb-2.5">
                  <div className="text-[13px] font-medium flex items-center gap-1.5">
                    <Icons.Bolt size={13} /> Automations
                  </div>
                  <div className="flex-1" />
                  <span className="chip chip-accent">3 on</span>
                </div>
                {[
                  { n: "Auto-sync new imports → Shopify", on: true },
                  { n: "Rewrite titles with AI", on: true },
                  { n: "Markup prices +20%", on: true },
                  { n: "Flag low-res images", on: false },
                ].map((a, i) => (
                  <div key={i} className={`flex items-center py-2 ${i === 0 ? "" : "border-t border-line-2"}`}>
                    <span className="text-[12.5px] text-ink-2 flex-1">{a.n}</span>
                    <Toggle on={a.on} />
                  </div>
                ))}
              </div>

              <div className="card p-4">
                <div className="text-[13px] font-medium mb-2.5 flex items-center gap-1.5">
                  <Icons.Plug size={13} /> Connections
                </div>
                {[
                  { n: "acme.myshopify.com", t: "Shopify", color: "#95BF47" },
                  { n: "wp.acmehome.com", t: "WooCommerce", color: "#7F54B3" },
                ].map((c, i) => (
                  <div key={i} className={`flex items-center py-2.5 ${i === 0 ? "" : "border-t border-line-2"}`}>
                    <div className="w-5 h-5 rounded mr-2.5 relative" style={{ background: c.color, opacity: 0.15 }}>
                      <div className="absolute inset-1 rounded-sm" style={{ background: c.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{c.n}</div>
                      <div className="text-[11px] text-muted">{c.t}</div>
                    </div>
                    <span className="dot text-accent" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className="w-[26px] h-[14px] rounded-full relative transition-colors"
      style={{ background: on ? "var(--ink)" : "var(--line)" }}
    >
      <div
        className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-[left]"
        style={{ left: on ? 14 : 2 }}
      />
    </div>
  );
}
