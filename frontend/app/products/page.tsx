"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { listCrawls, type Crawl } from "@/lib/api";

export default function ProductsList() {
  const [crawls, setCrawls] = useState<Crawl[]>([]);
  useEffect(() => { listCrawls(50).then(setCrawls).catch(() => {}); }, []);
  const done = crawls.filter((c) => c.status === "done");

  return (
    <Shell active="products" crumbs={["Acme Co.", "Extracts"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5 md:mb-6">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Extracts</h1>
            <p className="text-[13.5px] text-muted mt-1">{done.length} completed extract{done.length === 1 ? "" : "s"}.</p>
          </div>
          <div className="sm:flex-1" />
          <Link href="/" className="btn-primary self-start sm:self-auto"><Icons.Plus size={14}/> New extract</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {done.map((c) => (
            <Link key={c.id} href={`/crawls/${c.id}`} className="card p-4 hover:border-ink transition-colors">
              <div className="flex items-center gap-2 mb-2">
                <span className="chip capitalize">{c.platform}</span>
                <span className="chip">{c.total || c.product_count || 0} products</span>
              </div>
              <div className="font-mono text-[12px] text-muted truncate mb-3">{new URL(c.url).hostname.replace(/^www\./, "")}</div>
              <div className="grid grid-cols-4 gap-1.5">
                {(c.thumbnails || []).slice(0, 4).map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" className="rounded border border-line object-cover bg-white" style={{ aspectRatio: "1/1" }} />
                ))}
                {(!c.thumbnails || c.thumbnails.length === 0) && (
                  <div className="ph col-span-4" style={{ aspectRatio: "3/1" }}>NO IMAGES</div>
                )}
              </div>
            </Link>
          ))}
          {done.length === 0 && (
            <div className="col-span-1 sm:col-span-2 lg:col-span-3 text-center text-muted text-sm py-16">
              No extracts yet. <Link className="underline" href="/">Start one</Link>.
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
