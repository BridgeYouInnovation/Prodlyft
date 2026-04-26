"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import type { WpConnection } from "@/lib/blogger";

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function BloggerOverview() {
  const [conns, setConns] = useState<WpConnection[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/blogger/connections")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setConns(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  async function disconnect(id: string) {
    if (!confirm("Disconnect this site? Any schedules tied to it will stop firing.")) return;
    await fetch(`/api/blogger/connections/${id}`, { method: "DELETE" });
    setConns((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <Shell active="blogger" crumbs={["Auto Blogger"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Auto Blogger</h1>
            <p className="text-[13.5px] text-muted mt-1">
              Generate blog posts with AI and publish them straight to your WordPress sites.
            </p>
          </div>
          <div className="sm:flex-1" />
          <Link href="/blogger/connect" className="btn-primary self-start sm:self-auto">
            <Icons.Plus size={14} /> Connect WordPress
          </Link>
        </div>

        {!loaded ? (
          <div className="text-muted text-sm py-10 text-center">Loading…</div>
        ) : conns.length === 0 ? (
          <div className="card px-6 py-16 text-center max-w-[560px] mx-auto">
            <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4 bg-line-2">
              <Icons.Plug size={20} className="text-muted" />
            </div>
            <div className="text-[16px] font-[560] mb-2">No WordPress sites connected yet</div>
            <p className="text-[13px] text-muted mb-6 leading-[1.55]">
              Install our small WordPress plugin, paste the API key here, and Prodlyft can start writing and publishing posts to your site automatically.
            </p>
            <Link href="/blogger/connect" className="btn-primary btn-lg">
              <Icons.Plus size={14} /> Connect your first site
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="text-[11.5px] text-muted uppercase tracking-wider">Connected sites</div>
            {conns.map((c) => (
              <div key={c.id} className="card p-4 flex items-start gap-3 flex-wrap">
                <div
                  className="w-10 h-10 rounded-lg relative flex-shrink-0"
                  style={{ background: "#21759B", opacity: 0.18 }}
                >
                  <div className="absolute inset-1.5 rounded-md" style={{ background: "#21759B" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium">{c.site_name || "WordPress site"}</div>
                  <div className="font-mono text-[11.5px] text-muted truncate">{c.site_url}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="chip chip-accent">Active</span>
                    {c.wp_version && <span className="chip">WP {c.wp_version}</span>}
                    <span className="chip">Pinged {timeAgo(c.last_ping_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {/* Schedules + new-article CTAs land in the next commit. */}
                  <button onClick={() => disconnect(c.id)} className="btn-sm btn-ghost text-danger">Disconnect</button>
                </div>
              </div>
            ))}
            <div className="card p-5 text-center mt-3">
              <div className="text-[14px] font-[560] mb-1.5">Schedules and article history are coming next</div>
              <p className="text-[13px] text-muted">
                The connection plumbing is live. The generation pipeline (topics → AI article → WordPress post, on a cadence) ships in the next update.
              </p>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
