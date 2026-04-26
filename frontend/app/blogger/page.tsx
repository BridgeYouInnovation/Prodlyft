"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { CADENCE_LABEL, type WpConnection, type BlogSchedule, type BlogArticle } from "@/lib/blogger";

interface ScheduleRow extends BlogSchedule {
  site_url: string;
  site_name: string | null;
  article_count: number;
}

interface ArticleRow extends BlogArticle {
  site_url: string | null;
  site_name: string | null;
  schedule_name: string | null;
}

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

function untilNext(iso: string | null) {
  if (!iso) return "—";
  const d = (new Date(iso).getTime() - Date.now()) / 1000;
  if (d < 60) return "any minute";
  if (d < 3600) return `in ${Math.floor(d / 60)}m`;
  if (d < 86400) return `in ${Math.floor(d / 3600)}h`;
  return `in ${Math.floor(d / 86400)}d`;
}

export default function BloggerOverview() {
  const [conns, setConns] = useState<WpConnection[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [c, s, a] = await Promise.all([
      fetch("/api/blogger/connections").then((r) => r.ok ? r.json() : []),
      fetch("/api/blogger/schedules").then((r) => r.ok ? r.json() : []),
      fetch("/api/blogger/articles").then((r) => r.ok ? r.json() : []),
    ]);
    setConns(c); setSchedules(s); setArticles(a); setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function disconnect(id: string) {
    if (!confirm("Disconnect this site? Schedules tied to it will be deleted too.")) return;
    await fetch(`/api/blogger/connections/${id}`, { method: "DELETE" });
    await load();
  }

  async function toggleSchedule(s: ScheduleRow) {
    await fetch(`/api/blogger/schedules/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
  }

  async function deleteSchedule(s: ScheduleRow) {
    if (!confirm(`Delete schedule "${s.name}"? Past articles stay in your history.`)) return;
    await fetch(`/api/blogger/schedules/${s.id}`, { method: "DELETE" });
    await load();
  }

  return (
    <Shell active="blogger" crumbs={["Auto Blogger"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Auto Blogger</h1>
            <p className="text-[13.5px] text-muted mt-1">
              Generate WordPress posts with AI, on a schedule or one at a time.
            </p>
          </div>
          <div className="sm:flex-1" />
          {conns.length > 0 && (
            <div className="flex gap-2 self-start sm:self-auto">
              <Link href="/blogger/new" className="btn"><Icons.Sparkle size={14}/> One-off article</Link>
              <Link href="/blogger/schedules/new" className="btn-primary"><Icons.Plus size={14}/> New schedule</Link>
            </div>
          )}
        </div>

        {!loaded ? (
          <div className="text-muted text-sm py-10 text-center">Loading…</div>
        ) : conns.length === 0 ? (
          <div className="card px-6 py-16 text-center max-w-[560px] mx-auto">
            <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4 bg-line-2">
              <Icons.Plug size={20} className="text-muted" />
            </div>
            <div className="text-[16px] font-[560] mb-2">Connect WordPress to begin</div>
            <p className="text-[13px] text-muted mb-6 leading-[1.55]">
              Install our small WordPress plugin, paste the API key here, and Prodlyft can write and publish posts to your site automatically.
            </p>
            <Link href="/blogger/connect" className="btn-primary btn-lg">
              <Icons.Plus size={14} /> Connect your first site
            </Link>
          </div>
        ) : (
          <div className="grid gap-6">
            {/* Sites */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[13.5px] uppercase tracking-wider text-muted">Connected sites</h2>
                <span className="chip">{conns.length}</span>
                <div className="flex-1" />
                <Link href="/blogger/connect" className="btn-sm btn-ghost"><Icons.Plus size={12}/> Add site</Link>
              </div>
              <div className="grid gap-2">
                {conns.map((c) => (
                  <div key={c.id} className="card p-4 flex items-start gap-3 flex-wrap">
                    <div className="w-9 h-9 rounded-md relative flex-shrink-0" style={{ background: "#21759B", opacity: 0.18 }}>
                      <div className="absolute inset-1.5 rounded-sm" style={{ background: "#21759B" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-medium truncate">{c.site_name || "WordPress site"}</div>
                      <div className="font-mono text-[11.5px] text-muted truncate">{c.site_url}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="chip chip-accent">Active</span>
                      {c.wp_version && <span className="chip">WP {c.wp_version}</span>}
                      <button onClick={() => disconnect(c.id)} className="btn-sm btn-ghost text-danger">Disconnect</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Schedules */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[13.5px] uppercase tracking-wider text-muted">Schedules</h2>
                <span className="chip">{schedules.length}</span>
                <div className="flex-1" />
                <Link href="/blogger/schedules/new" className="btn-sm btn-ghost"><Icons.Plus size={12}/> New schedule</Link>
              </div>
              {schedules.length === 0 ? (
                <div className="card p-5 text-center text-[13px] text-muted">
                  No recurring schedules yet. <Link href="/blogger/schedules/new" className="text-ink hover:underline">Create one</Link>.
                </div>
              ) : (
                <div className="grid gap-2">
                  {schedules.map((s) => (
                    <div key={s.id} className="card p-4 flex items-start gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-medium truncate">{s.name}</div>
                        <div className="text-[11.5px] text-muted mt-0.5 flex flex-wrap items-center gap-2">
                          <span>{s.site_name || s.site_url}</span>
                          <span>·</span>
                          <span>{CADENCE_LABEL[s.cadence] ?? s.cadence}</span>
                          <span>·</span>
                          <span>{(s.topics || []).length} topic{(s.topics || []).length === 1 ? "" : "s"}</span>
                          <span>·</span>
                          <span>{s.article_count} run{s.article_count === 1 ? "" : "s"}</span>
                        </div>
                        <div className="text-[11px] text-muted-2 mt-0.5">
                          {s.enabled ? <>Next run {untilNext(s.next_run_at)}</> : <em>paused</em>}
                          {s.last_run_at && <> · last {timeAgo(s.last_run_at)}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`chip ${s.publish_status === "publish" ? "chip-accent" : ""}`}>
                          {s.publish_status === "publish" ? "Auto-publish" : "Draft"}
                        </span>
                        <button onClick={() => toggleSchedule(s)} className="btn-sm">
                          {s.enabled ? "Pause" : "Resume"}
                        </button>
                        <button onClick={() => deleteSchedule(s)} className="btn-sm btn-ghost text-danger">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recent articles */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-[13.5px] uppercase tracking-wider text-muted">Recent articles</h2>
                <span className="chip">{articles.length}</span>
                <div className="flex-1" />
                <Link href="/blogger/articles" className="btn-sm btn-ghost">View all</Link>
              </div>
              {articles.length === 0 ? (
                <div className="card p-5 text-center text-[13px] text-muted">
                  Nothing generated yet. Create a schedule or write a one-off.
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table>
                      <thead>
                        <tr>
                          <th>Title / topic</th>
                          <th>Status</th>
                          <th className="hidden md:table-cell">Schedule</th>
                          <th>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {articles.slice(0, 6).map((a) => (
                          <tr key={a.id}>
                            <td className="max-w-[360px]">
                              <div className="font-medium text-ink truncate">
                                {a.wp_post_url ? (
                                  <a href={a.wp_post_url} target="_blank" rel="noopener noreferrer" className="hover:underline">{a.title || a.topic}</a>
                                ) : (
                                  a.title || a.topic
                                )}
                              </div>
                              {a.error && <div className="text-[11px] text-danger truncate">{a.error}</div>}
                            </td>
                            <td>
                              <span className={`chip ${
                                a.status === "posted" ? a.publish_status === "publish" ? "chip-accent" : "chip"
                                : a.status === "failed" ? "" : "chip-warn"
                              }`}>
                                {a.status === "posted" ? a.publish_status === "publish" ? "Published" : "Drafted" : a.status}
                              </span>
                            </td>
                            <td className="hidden md:table-cell text-[11.5px] text-muted">
                              {a.schedule_name || <span className="text-muted-2">one-off</span>}
                            </td>
                            <td className="text-[11.5px] text-muted">{timeAgo(a.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </Shell>
  );
}
