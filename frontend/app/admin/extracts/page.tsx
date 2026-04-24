"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
}

function hostname(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export default function AdminExtracts() {
  const router = useRouter();
  const [rows, setRows] = useState<AdminCrawl[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/crawls");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (!q.trim()) return true;
    return hostname(c.url).includes(q.toLowerCase());
  });

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">Extracts</h1>
      <p className="text-[13.5px] text-muted mb-5">Every crawl across all users.</p>

      {err && <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-[320px]">
          <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
          <input className="input pl-8" placeholder="Search by host" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1">
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
      </div>

      <div className="card overflow-hidden">
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
              {filtered.length === 0 && <tr><td colSpan={5} className="text-center text-muted py-10">No extracts.</td></tr>}
              {filtered.map((c) => (
                <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/admin/extracts/${c.id}`)}>
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
    </div>
  );
}
