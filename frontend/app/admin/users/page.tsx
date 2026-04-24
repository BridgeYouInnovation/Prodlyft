"use client";
import { useEffect, useState } from "react";
import { Icons } from "@/components/Icons";

interface AdminUser {
  id: number;
  email: string;
  name: string | null;
  is_admin: boolean;
  created_at: string | null;
  crawl_count: number;
}

export default function AdminUsers() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/users");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleAdmin(u: AdminUser) {
    setBusyId(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_admin: !u.is_admin }),
    });
    await load();
    setBusyId(null);
  }

  async function editName(u: AdminUser) {
    const name = prompt("New display name", u.name ?? "");
    if (name === null) return;
    setBusyId(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await load();
    setBusyId(null);
  }

  async function del(u: AdminUser) {
    if (!confirm(`Delete ${u.email}? This also deletes their extracts and products.`)) return;
    setBusyId(u.id);
    const r = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (!r.ok) alert("Delete failed");
    await load();
    setBusyId(null);
  }

  const filtered = rows.filter((u) => {
    if (!q.trim()) return true;
    const n = q.toLowerCase();
    return u.email.toLowerCase().includes(n) || (u.name || "").toLowerCase().includes(n);
  });

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">Users</h1>
      <p className="text-[13.5px] text-muted mb-5">{rows.length} accounts · Promote, edit, or delete.</p>

      {err && <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      <div className="flex items-center gap-2 mb-3 max-w-[420px]">
        <div className="relative flex-1">
          <Icons.Search size={13} className="absolute left-3 top-[11px] text-muted" />
          <input className="input pl-8" placeholder="Search email or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th className="hidden sm:table-cell">Name</th>
                <th>Extracts</th>
                <th>Role</th>
                <th className="hidden md:table-cell">Joined</th>
                <th style={{ width: 1 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-10">No users.</td></tr>}
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium text-ink max-w-[240px] truncate">{u.email}</td>
                  <td className="hidden sm:table-cell text-muted">{u.name ?? "—"}</td>
                  <td>{u.crawl_count}</td>
                  <td>
                    <span className={`chip ${u.is_admin ? "chip-accent" : ""}`}>
                      {u.is_admin ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="hidden md:table-cell text-muted">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      className="btn-sm btn-ghost"
                      disabled={busyId === u.id}
                      onClick={() => editName(u)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn-sm btn-ghost"
                      disabled={busyId === u.id}
                      onClick={() => toggleAdmin(u)}
                    >
                      {u.is_admin ? "Revoke" : "Promote"}
                    </button>
                    <button
                      className="btn-sm btn-ghost text-danger"
                      disabled={busyId === u.id}
                      onClick={() => del(u)}
                    >
                      Delete
                    </button>
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
