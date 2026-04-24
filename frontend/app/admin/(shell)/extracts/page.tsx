"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/Icons";

interface AdminCrawl {
  id: string;
  url: string;
  platform: string;
  mode: string;
  status: string;
  total: number;
  created_at: string | null;
  updated_at: string | null;
  user_id: number | null;
  user_email: string | null;
}

interface UserBucket {
  user_id: number | null;
  user_email: string | null;
  user_name: string | null;
  user_is_admin: boolean | null;
  crawl_count: number;
  product_count: number;
  done_count: number;
  failed_count: number;
  running_count: number;
  last_crawl_at: string | null;
}

function hostname(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export default function AdminExtracts() {
  const router = useRouter();
  const [view, setView] = useState<"by-user" | "flat">("by-user");
  const [rows, setRows] = useState<AdminCrawl[]>([]);
  const [buckets, setBuckets] = useState<UserBucket[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [flat, byUser] = await Promise.all([
          fetch("/api/admin/crawls").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
          fetch("/api/admin/crawls-by-user").then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
        ]);
        setRows(flat);
        setBuckets(byUser);
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((c) => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (!q.trim()) return true;
      const n = q.toLowerCase();
      return (
        hostname(c.url).includes(n) ||
        (c.user_email || "").toLowerCase().includes(n)
      );
    });
  }, [rows, q, statusFilter]);

  const bucketRowsByUser = useMemo(() => {
    const m = new Map<string, AdminCrawl[]>();
    for (const c of filteredRows) {
      const key = c.user_id == null ? "__orphan__" : String(c.user_id);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(c);
    }
    return m;
  }, [filteredRows]);

  const filteredBuckets = useMemo(() => {
    return buckets.filter((b) => {
      if (!q.trim()) return true;
      const n = q.toLowerCase();
      return (b.user_email || "").toLowerCase().includes(n) || (b.user_name || "").toLowerCase().includes(n);
    });
  }, [buckets, q]);

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">Extracts</h1>
      <p className="text-[13.5px] text-muted mb-5">
        Every crawl across all users. Grouped by who created it.
      </p>

      {err && <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
          <input
            className="input pl-8"
            placeholder={view === "by-user" ? "Search user email" : "Search host or user"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {view === "flat" && (
          <div className="flex gap-1 flex-wrap">
            {["all", "done", "processing", "pending", "failed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className="px-2.5 py-1 rounded-full text-[12px] capitalize"
                style={{
                  background: statusFilter === s ? "var(--ink)" : "white",
                  color: statusFilter === s ? "var(--bg)" : "var(--muted)",
                  border: statusFilter === s ? "none" : "1px solid var(--line)",
                  fontWeight: statusFilter === s ? 500 : 400,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <div className="flex border border-line rounded-md bg-white p-0.5">
          {([["by-user", "By user"], ["flat", "All crawls"]] as const).map(([key, label]) => (
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

      {view === "by-user" ? (
        <div className="flex flex-col gap-2">
          {filteredBuckets.length === 0 && (
            <div className="card py-10 text-center text-muted text-sm">No users yet.</div>
          )}
          {filteredBuckets.map((b) => {
            const key = b.user_id == null ? "__orphan__" : String(b.user_id);
            const userLabel = b.user_email ?? "Orphan (pre-auth)";
            const userCrawls = bucketRowsByUser.get(key) ?? [];
            const isOpen = expanded === key;

            return (
              <div key={key} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : key)}
                  className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-surface2 transition-colors"
                >
                  <div
                    className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-medium flex-shrink-0"
                    style={{
                      background: b.user_id == null
                        ? "linear-gradient(135deg, #9A998F, #6B6A63)"
                        : "linear-gradient(135deg, #A8B5A0, #6A7A6C)",
                    }}
                  >
                    {(userLabel[0] || "?").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13.5px] font-medium truncate">{userLabel}</span>
                      {b.user_is_admin && <span className="chip chip-accent text-[10px]">admin</span>}
                      {b.user_id == null && <span className="chip text-[10px]">legacy</span>}
                    </div>
                    <div className="text-[11.5px] text-muted mt-0.5">
                      {b.crawl_count} extract{b.crawl_count === 1 ? "" : "s"} ·{" "}
                      {b.product_count.toLocaleString()} product{b.product_count === 1 ? "" : "s"}
                      {b.last_crawl_at && <> · last {new Date(b.last_crawl_at).toLocaleDateString()}</>}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-[11.5px] mr-2">
                    {b.done_count > 0 && <span className="chip chip-accent">{b.done_count} done</span>}
                    {b.running_count > 0 && <span className="chip chip-warn">{b.running_count} running</span>}
                    {b.failed_count > 0 && <span className="chip">{b.failed_count} failed</span>}
                  </div>
                  <Icons.ChevronDown
                    size={14}
                    className="text-muted-2"
                    style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 150ms" }}
                  />
                </button>

                {isOpen && (
                  <div className="border-t border-line overflow-x-auto">
                    {userCrawls.length === 0 ? (
                      <div className="p-6 text-center text-muted text-[12.5px]">No extracts for this user in the current filter.</div>
                    ) : (
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
                          {userCrawls.map((c) => (
                            <tr
                              key={c.id}
                              className="cursor-pointer"
                              onClick={() => router.push(`/admin/extracts/${c.id}`)}
                            >
                              <td>
                                <div className="font-mono text-[12px] text-muted">{hostname(c.url)}</div>
                                <div className="text-[10.5px] text-muted-2 font-mono">{c.id.slice(0, 8)}</div>
                              </td>
                              <td className="hidden sm:table-cell capitalize">{c.platform}</td>
                              <td className="font-medium">{c.total}</td>
                              <td className="capitalize">{c.status}</td>
                              <td className="hidden md:table-cell text-muted">
                                {c.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Source</th>
                  <th className="hidden sm:table-cell">Platform</th>
                  <th>Products</th>
                  <th>Status</th>
                  <th className="hidden md:table-cell">Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-10">No extracts.</td></tr>}
                {filteredRows.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/admin/extracts/${c.id}`)}>
                    <td>
                      <div className="text-[12.5px] font-medium truncate max-w-[200px]">
                        {c.user_email ?? <span className="text-muted-2">Orphan</span>}
                      </div>
                    </td>
                    <td>
                      <div className="font-mono text-[12px] text-muted">{hostname(c.url)}</div>
                      <div className="text-[10.5px] text-muted-2 font-mono">{c.id.slice(0, 8)}</div>
                    </td>
                    <td className="hidden sm:table-cell capitalize">{c.platform}</td>
                    <td className="font-medium">{c.total}</td>
                    <td className="capitalize">{c.status}</td>
                    <td className="hidden md:table-cell text-muted">
                      {c.updated_at ? new Date(c.updated_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-6 text-[11.5px] text-muted-2">
        Orphan rows are crawls created before the auth gate landed — they have no owner.
      </div>
    </div>
  );
}
