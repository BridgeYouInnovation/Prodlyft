"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "@/components/Icons";
import { CADENCE_LABEL } from "@/lib/blogger";

interface Overview {
  connections: number;
  users_with_wp: number;
  schedules: number;
  schedules_active: number;
  articles: number;
  articles_7d: number;
  articles_failed: number;
}

interface AdminConnection {
  id: string;
  user_id: number;
  user_email: string | null;
  site_url: string;
  site_name: string | null;
  wp_version: string | null;
  status: string;
  last_ping_at: string | null;
  created_at: string;
  schedule_count: number;
  article_count: number;
}

interface AdminSchedule {
  id: string;
  user_id: number;
  user_email: string | null;
  wp_connection_id: string;
  site_url: string | null;
  site_name: string | null;
  name: string;
  topics: string[];
  cadence: string;
  length_target: string;
  publish_status: string;
  generate_image: boolean;
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string;
  created_at: string;
  article_count: number;
}

interface AdminArticle {
  id: string;
  user_id: number;
  user_email: string | null;
  topic: string;
  title: string | null;
  status: string;
  publish_status: string;
  wp_post_url: string | null;
  error: string | null;
  created_at: string;
  site_name: string | null;
  site_url: string | null;
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
  if (d < 60 && d > -60) return "any minute";
  if (d < 0) return `${Math.floor(-d / 60)}m overdue`;
  if (d < 3600) return `in ${Math.floor(d / 60)}m`;
  if (d < 86400) return `in ${Math.floor(d / 3600)}h`;
  return `in ${Math.floor(d / 86400)}d`;
}

export default function AdminBlogger() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [conns, setConns] = useState<AdminConnection[]>([]);
  const [schedules, setSchedules] = useState<AdminSchedule[]>([]);
  const [articles, setArticles] = useState<AdminArticle[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<"by-user" | "schedules" | "connections" | "articles">("by-user");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tickResult, setTickResult] = useState<string | null>(null);

  async function load() {
    try {
      const [o, c, s, a] = await Promise.all([
        fetch("/api/admin/blogger/overview").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/blogger/connections").then((r) => r.ok ? r.json() : []),
        fetch("/api/admin/blogger/schedules").then((r) => r.ok ? r.json() : []),
        fetch("/api/admin/blogger/articles").then((r) => r.ok ? r.json() : []),
      ]);
      setOverview(o); setConns(c); setSchedules(s); setArticles(a);
    } catch (e) { setErr((e as Error).message); }
  }

  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, []);

  async function toggleSchedule(s: AdminSchedule) {
    setBusy(s.id);
    await fetch(`/api/admin/blogger/schedules/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !s.enabled }),
    });
    await load();
    setBusy(null);
  }

  async function deleteSchedule(s: AdminSchedule) {
    if (!confirm(`Delete schedule "${s.name}" for ${s.user_email}? Past articles stay.`)) return;
    setBusy(s.id);
    await fetch(`/api/admin/blogger/schedules/${s.id}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  async function runCronNow() {
    setTickResult("running…");
    const r = await fetch("/api/admin/cron/run", { method: "POST" });
    const b = await r.json();
    setTickResult(`HTTP ${b.status}: ${JSON.stringify(b.body).slice(0, 240)}`);
    await load();
  }

  // Group everything by user for the "By user" view.
  type UserBucket = { user_id: number; user_email: string | null; conns: AdminConnection[]; schedules: AdminSchedule[]; articles: AdminArticle[] };
  const byUser = useMemo<UserBucket[]>(() => {
    const map = new Map<number, UserBucket>();
    function ensure(uid: number, email: string | null): UserBucket {
      if (!map.has(uid)) map.set(uid, { user_id: uid, user_email: email, conns: [], schedules: [], articles: [] });
      return map.get(uid)!;
    }
    for (const c of conns) ensure(c.user_id, c.user_email).conns.push(c);
    for (const s of schedules) ensure(s.user_id, s.user_email).schedules.push(s);
    for (const a of articles) ensure(a.user_id, a.user_email).articles.push(a);
    let arr = Array.from(map.values());
    if (q.trim()) {
      const n = q.toLowerCase();
      arr = arr.filter((u) => (u.user_email || "").toLowerCase().includes(n));
    }
    arr.sort((a, b) => (b.articles.length + b.schedules.length) - (a.articles.length + a.schedules.length));
    return arr;
  }, [conns, schedules, articles, q]);

  const filteredSchedules = useMemo(() => schedules.filter((s) =>
    !q.trim() || (s.user_email || "").toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase())
  ), [schedules, q]);

  const filteredConns = useMemo(() => conns.filter((c) =>
    !q.trim() || (c.user_email || "").toLowerCase().includes(q.toLowerCase()) || c.site_url.toLowerCase().includes(q.toLowerCase())
  ), [conns, q]);

  const filteredArticles = useMemo(() => articles.filter((a) =>
    !q.trim() || (a.user_email || "").toLowerCase().includes(q.toLowerCase()) ||
    (a.title || a.topic).toLowerCase().includes(q.toLowerCase())
  ), [articles, q]);

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">Auto Blogger</h1>
          <p className="text-[13.5px] text-muted">Connections, schedules, and articles across every user.</p>
        </div>
        <div className="sm:flex-1" />
        <button onClick={runCronNow} className="btn self-start sm:self-auto">
          <Icons.Play size={12} /> Run cron now
        </button>
      </div>

      {tickResult && (
        <div className="mb-4 p-3 rounded-md text-[12.5px] bg-surface2 border border-line font-mono break-all">
          {tickResult}
        </div>
      )}
      {err && <div className="mb-4 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Users with WP" value={overview?.users_with_wp ?? "—"} />
        <Stat label="WP sites" value={overview?.connections ?? "—"} />
        <Stat label="Active schedules" value={`${overview?.schedules_active ?? "—"} / ${overview?.schedules ?? "—"}`} />
        <Stat label="Articles (7d / total)" value={`${overview?.articles_7d ?? "—"} / ${overview?.articles ?? "—"}`} sub={overview?.articles_failed ? `${overview.articles_failed} failed` : null} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
          <input
            className="input pl-8"
            placeholder={view === "by-user" ? "Search user email" : "Search user, site, or title"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex-1" />
        <div className="flex border border-line rounded-md bg-white p-0.5 flex-wrap">
          {([
            ["by-user", "By user"],
            ["schedules", "Schedules"],
            ["connections", "Sites"],
            ["articles", "Articles"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className="px-2.5 py-1 text-[12px] rounded-sm"
              style={{
                background: view === key ? "var(--ink)" : "transparent",
                color: view === key ? "var(--bg)" : "var(--muted)",
                fontWeight: view === key ? 500 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {view === "by-user" && (
        <div className="grid gap-2">
          {byUser.length === 0 && (
            <div className="card py-10 text-center text-muted text-sm">No blogger activity yet.</div>
          )}
          {byUser.map((u) => (
            <div key={u.user_id} className="card p-4">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[11px] font-medium" style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}>
                  {(u.user_email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="text-[13.5px] font-medium truncate">{u.user_email || `user ${u.user_id}`}</div>
                <div className="flex-1" />
                <span className="chip">{u.conns.length} site{u.conns.length === 1 ? "" : "s"}</span>
                <span className="chip">{u.schedules.length} schedule{u.schedules.length === 1 ? "" : "s"}</span>
                <span className="chip">{u.articles.length} article{u.articles.length === 1 ? "" : "s"}</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mt-2 text-[11.5px]">
                <div>
                  <div className="uppercase tracking-wider text-muted mb-1">Schedules</div>
                  {u.schedules.length === 0 ? (
                    <div className="text-muted-2">none</div>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {u.schedules.map((s) => (
                        <li key={s.id} className="flex items-center gap-1.5">
                          <span className="dot" style={{ color: s.enabled ? "var(--accent)" : "var(--muted-2)" }} />
                          <span className="truncate">{s.name}</span>
                          <span className="text-muted-2 whitespace-nowrap ml-auto">{CADENCE_LABEL[s.cadence as "weekly"] ?? s.cadence}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="uppercase tracking-wider text-muted mb-1">Latest articles</div>
                  {u.articles.length === 0 ? (
                    <div className="text-muted-2">none</div>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {u.articles.slice(0, 4).map((a) => (
                        <li key={a.id} className="flex items-center gap-1.5">
                          <span className="dot" style={{ color: a.status === "posted" ? "var(--accent)" : a.status === "failed" ? "var(--danger)" : "oklch(0.65 0.13 70)" }} />
                          <span className="truncate">{a.title || a.topic}</span>
                          <span className="text-muted-2 whitespace-nowrap ml-auto">{timeAgo(a.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "schedules" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>User</th>
                  <th className="hidden sm:table-cell">Cadence</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Next run</th>
                  <th>Articles</th>
                  <th style={{ width: 1 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredSchedules.length === 0 && (<tr><td colSpan={7} className="text-center text-muted py-10">No schedules.</td></tr>)}
                {filteredSchedules.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-[280px]">
                      <div className="font-medium text-ink truncate">{s.name}</div>
                      <div className="text-[11px] text-muted-2 truncate">{s.site_name || s.site_url}</div>
                    </td>
                    <td className="text-[12.5px] text-muted">{s.user_email}</td>
                    <td className="hidden sm:table-cell capitalize">{s.cadence}</td>
                    <td>
                      <span className={`chip ${s.enabled ? "chip-accent" : ""}`}>
                        {s.enabled ? "Active" : "Paused"}
                      </span>
                      <span className={`ml-1 chip ${s.publish_status === "publish" ? "chip-warn" : ""}`}>
                        {s.publish_status === "publish" ? "Auto-publish" : "Draft"}
                      </span>
                    </td>
                    <td className="hidden md:table-cell text-[11.5px] text-muted">
                      {s.enabled ? untilNext(s.next_run_at) : "—"}
                      {s.last_run_at && <div className="text-[10.5px] text-muted-2">last {timeAgo(s.last_run_at)}</div>}
                    </td>
                    <td>{s.article_count}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn-sm btn-ghost" disabled={busy === s.id} onClick={() => toggleSchedule(s)}>
                        {s.enabled ? "Pause" : "Resume"}
                      </button>
                      <button className="btn-sm btn-ghost text-danger" disabled={busy === s.id} onClick={() => deleteSchedule(s)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "connections" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th>User</th>
                  <th className="hidden md:table-cell">WP</th>
                  <th>Schedules</th>
                  <th>Articles</th>
                  <th>Last ping</th>
                </tr>
              </thead>
              <tbody>
                {filteredConns.length === 0 && (<tr><td colSpan={6} className="text-center text-muted py-10">No connections.</td></tr>)}
                {filteredConns.map((c) => (
                  <tr key={c.id}>
                    <td className="max-w-[300px]">
                      <div className="font-medium text-ink truncate">{c.site_name || "WordPress site"}</div>
                      <div className="font-mono text-[11px] text-muted truncate">{c.site_url}</div>
                    </td>
                    <td className="text-[12.5px] text-muted">{c.user_email}</td>
                    <td className="hidden md:table-cell text-[12px] text-muted">{c.wp_version || "—"}</td>
                    <td>{c.schedule_count}</td>
                    <td>{c.article_count}</td>
                    <td className="text-[11.5px] text-muted">{timeAgo(c.last_ping_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === "articles" && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Title / topic</th>
                  <th>User</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Schedule</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.length === 0 && (<tr><td colSpan={5} className="text-center text-muted py-10">No articles.</td></tr>)}
                {filteredArticles.map((a) => (
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
                    <td className="text-[12.5px] text-muted">{a.user_email}</td>
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

      <div className="mt-6 text-[11.5px] text-muted-2 leading-[1.55]">
        "Run cron now" hits <span className="font-mono">/api/cron/blog-tick</span> with the server's CRON_SECRET — useful for testing schedules without waiting for the hourly Vercel cron. Pause + Delete on schedules act on any user's data; please use sparingly.
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string | null }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[11.5px] text-muted mb-1.5">{label}</div>
      <div className="text-[20px] md:text-2xl font-[560] tracking-tight2">{value}</div>
      {sub && <div className="text-[11px] text-danger mt-0.5">{sub}</div>}
    </div>
  );
}
