"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icons } from "@/components/Icons";

interface Overview {
  users: number;
  admins: number;
  crawls: number;
  products: number;
  statuses: { pending: number; processing: number; done: number; failed: number };
}

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Forbidden"))))
      .then(setData)
      .catch((e: Error) => setErr(e.message));
  }, []);

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <h1 className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-1.5">Overview</h1>
      <p className="text-[13.5px] text-muted mb-6">Everything across every account.</p>

      {err && <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Stat label="Users" value={data?.users ?? "—"} />
        <Stat label="Admins" value={data?.admins ?? "—"} />
        <Stat label="Extracts" value={data?.crawls ?? "—"} />
        <Stat label="Products" value={data?.products ?? "—"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="text-[13px] font-medium mb-3">Extract statuses</div>
          <div className="space-y-2 text-[13px]">
            <Row k="Done" v={data?.statuses.done ?? "—"} color="var(--accent)" />
            <Row k="Processing" v={data?.statuses.processing ?? "—"} color="oklch(0.65 0.13 70)" />
            <Row k="Queued" v={data?.statuses.pending ?? "—"} color="var(--muted-2)" />
            <Row k="Failed" v={data?.statuses.failed ?? "—"} color="var(--danger)" />
          </div>
        </div>
        <div className="card p-5">
          <div className="text-[13px] font-medium mb-3">Quick links</div>
          <div className="flex flex-col gap-2">
            <Link href="/admin/users" className="btn justify-between">
              <span className="flex items-center gap-2"><Icons.Box size={14}/> Manage users</span>
              <Icons.ArrowRight size={12} />
            </Link>
            <Link href="/admin/extracts" className="btn justify-between">
              <span className="flex items-center gap-2"><Icons.Import size={14}/> Manage extracts</span>
              <Icons.ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[11.5px] text-muted mb-1.5">{label}</div>
      <div className="text-2xl font-[560] tracking-tight2">{value}</div>
    </div>
  );
}

function Row({ k, v, color }: { k: string; v: string | number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="dot" style={{ color }} />
      <span className="flex-1">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
