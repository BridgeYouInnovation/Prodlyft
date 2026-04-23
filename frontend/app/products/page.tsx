"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Icons } from "@/components/Icons";
import { listJobs, type Job } from "@/lib/api";

export default function ProductsList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => { listJobs(50).then(setJobs).catch(() => {}); }, []);
  const done = jobs.filter((j) => j.status === "done" && j.result);

  return (
    <div className="min-h-screen flex">
      <Sidebar active="products" />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={["Acme Co.", "Products"]} />
        <div className="flex-1 overflow-auto px-8 py-7">
          <div className="flex items-start mb-6">
            <div>
              <h1 className="text-[22px]">Products</h1>
              <p className="text-[13.5px] text-muted mt-1">{done.length} imported product{done.length === 1 ? "" : "s"}.</p>
            </div>
            <div className="flex-1" />
            <Link href="/imports/new" className="btn-primary"><Icons.Plus size={14}/> New import</Link>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {done.map((j) => (
              <Link key={j.id} href={`/products/${j.id}`} className="card p-3 hover:border-ink transition-colors">
                {j.result?.images?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={j.result.images[0]} alt="" className="w-full rounded border border-line object-cover" style={{ aspectRatio: "1/1" }} />
                ) : (
                  <div className="ph w-full" style={{ aspectRatio: "1/1" }}>NO IMG</div>
                )}
                <div className="mt-2 text-[13px] font-medium truncate">{j.result?.title ?? "Untitled"}</div>
                <div className="text-[11.5px] text-muted font-mono truncate">{new URL(j.url).hostname}</div>
                <div className="text-[12px] mt-1">{j.result?.price != null ? `$${j.result.price}` : "—"}</div>
              </Link>
            ))}
            {done.length === 0 && (
              <div className="col-span-4 text-center text-muted text-sm py-16">
                No products yet. <Link className="underline" href="/imports/new">Start an import</Link>.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
