"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/Icons";
import { STATUS_CHIP, STATUS_LABEL, timeAgo, type Ticket } from "@/lib/tickets";

export default function AdminTickets() {
  const router = useRouter();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/tickets");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) { setErr((e as Error).message); }
  }
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const filtered = rows.filter((t) => {
    if (statusFilter === "active" && t.status === "closed") return false;
    if (statusFilter !== "all" && statusFilter !== "active" && t.status !== statusFilter) return false;
    if (!q.trim()) return true;
    const n = q.toLowerCase();
    return (
      (t.subject || "").toLowerCase().includes(n) ||
      (t.user_email || "").toLowerCase().includes(n)
    );
  });

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">Tickets</h1>
      <p className="text-[13.5px] text-muted mb-5">
        Sorted with "waiting on us" first, then "open", then everything else.
      </p>

      {err && <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-[360px]">
          <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
          <input className="input pl-8" placeholder="Search subject or user" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1 flex-wrap">
          {[
            ["active", "Active"],
            ["waiting_admin", "Waiting on us"],
            ["waiting_user", "Waiting on user"],
            ["closed", "Closed"],
            ["all", "All"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className="px-2.5 py-1 rounded-full text-[12px]"
              style={{
                background: statusFilter === key ? "var(--ink)" : "white",
                color: statusFilter === key ? "var(--bg)" : "var(--muted)",
                border: statusFilter === key ? "none" : "1px solid var(--line)",
                fontWeight: statusFilter === key ? 500 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Subject</th>
                <th>User</th>
                <th>Status</th>
                <th className="hidden sm:table-cell">Messages</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted py-10">No tickets match.</td></tr>
              )}
              {filtered.map((t) => (
                <tr key={t.id} className="cursor-pointer" onClick={() => router.push(`/admin/tickets/${t.id}`)}>
                  <td className="max-w-[360px]">
                    <div className="font-medium text-ink truncate">{t.subject}</div>
                    {t.related_crawl_id && (
                      <div className="text-[11px] text-muted-2 font-mono">extract {t.related_crawl_id.slice(0, 8)}</div>
                    )}
                  </td>
                  <td className="text-[12.5px] text-muted">{t.user_email ?? "—"}</td>
                  <td>
                    <span className={`chip ${STATUS_CHIP[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                    {(t.unread_for_admin || 0) > 0 && (
                      <span className="ml-1.5 chip chip-warn">{t.unread_for_admin} new</span>
                    )}
                  </td>
                  <td className="hidden sm:table-cell">{t.message_count ?? 0}</td>
                  <td className="text-muted">{timeAgo(t.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
