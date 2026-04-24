"use client";
import { useEffect, useState } from "react";
import { Icons } from "@/components/Icons";

interface ConfigRow {
  domain: string;
  platform: string;
  hit_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export default function AdminConfigs() {
  const [rows, setRows] = useState<ConfigRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ domain: string; body: string } | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/scrape-configs");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function del(domain: string) {
    if (!confirm(`Evict cached config for ${domain}? Next crawl will regenerate via AI.`)) return;
    setBusy(domain);
    await fetch(`/api/admin/scrape-configs/${encodeURIComponent(domain)}`, { method: "DELETE" });
    await load();
    setBusy(null);
  }

  async function view(domain: string) {
    setBusy(domain);
    const r = await fetch(`/api/admin/scrape-configs/${encodeURIComponent(domain)}`);
    const body = await r.json();
    setViewing({ domain, body: JSON.stringify(body, null, 2) });
    setBusy(null);
  }

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">AI scrape configs</h1>
      <p className="text-[13.5px] text-muted mb-5">
        Cached per domain. Evict an entry to force the next crawl on that domain to regenerate via Claude.
      </p>

      {err && <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Platform</th>
                <th>Hits</th>
                <th className="hidden md:table-cell">Created</th>
                <th className="hidden md:table-cell">Updated</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted py-10">
                  No cached configs yet. They get created the first time a non-Shopify / non-Woo URL is extracted.
                </td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.domain}>
                  <td className="font-mono text-[12px] text-ink">{r.domain}</td>
                  <td className="capitalize">{r.platform}</td>
                  <td>{r.hit_count}</td>
                  <td className="hidden md:table-cell text-muted">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="hidden md:table-cell text-muted">
                    {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-sm btn-ghost" disabled={busy === r.domain} onClick={() => view(r.domain)}>
                      View
                    </button>
                    <button className="btn-sm btn-ghost text-danger" disabled={busy === r.domain} onClick={() => del(r.domain)}>
                      Evict
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {viewing && (
        <div className="fixed inset-0 bg-black/50 z-50 grid place-items-center p-4" onClick={() => setViewing(null)}>
          <div className="bg-white rounded-lg max-w-[900px] w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-line flex items-center">
              <div className="font-mono text-[13px] font-medium">{viewing.domain}</div>
              <div className="flex-1" />
              <button className="btn-sm btn-ghost" onClick={() => setViewing(null)}><Icons.X size={14} /></button>
            </div>
            <pre className="p-4 text-[11.5px] overflow-auto font-mono">{viewing.body}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
