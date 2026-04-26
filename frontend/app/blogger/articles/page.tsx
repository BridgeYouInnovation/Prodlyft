"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import type { BlogArticle } from "@/lib/blogger";

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

export default function ArticleHistory() {
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/blogger/articles")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setRows(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <Shell active="blogger" crumbs={["Auto Blogger", "Articles"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Articles</h1>
            <p className="text-[13.5px] text-muted mt-1">
              Everything Auto Blogger has generated for you, scheduled or one-off.
            </p>
          </div>
          <div className="sm:flex-1" />
          <Link href="/blogger/new" className="btn-primary self-start sm:self-auto">
            <Icons.Sparkle size={14} /> New article
          </Link>
        </div>

        {!loaded ? (
          <div className="text-muted text-sm py-10 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="card px-6 py-16 text-center max-w-[480px] mx-auto">
            <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4 bg-line-2">
              <Icons.Sparkle size={20} className="text-muted" />
            </div>
            <div className="text-[16px] font-[560] mb-2">No articles yet</div>
            <p className="text-[13px] text-muted mb-6 leading-[1.55]">
              Generate a one-off article to test the connection or set up a recurring schedule.
            </p>
            <Link href="/blogger/new" className="btn-primary btn-lg">
              <Icons.Sparkle size={14} /> Generate one
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Title / topic</th>
                    <th>Status</th>
                    <th className="hidden sm:table-cell">Site</th>
                    <th className="hidden md:table-cell">Schedule</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td className="max-w-[360px]">
                        <div className="font-medium text-ink truncate">
                          {a.wp_post_url ? (
                            <a href={a.wp_post_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                              {a.title || a.topic}
                            </a>
                          ) : (
                            a.title || a.topic
                          )}
                        </div>
                        {a.title && a.topic !== a.title && (
                          <div className="text-[11px] text-muted-2 truncate">{a.topic}</div>
                        )}
                        {a.error && (
                          <div className="text-[11px] text-danger mt-0.5 truncate">{a.error}</div>
                        )}
                      </td>
                      <td>
                        <span className={`chip ${
                          a.status === "posted"
                            ? a.publish_status === "publish" ? "chip-accent" : "chip"
                            : a.status === "failed" ? "" : "chip-warn"
                        }`}>
                          {a.status === "posted"
                            ? a.publish_status === "publish" ? "Published" : "Drafted"
                            : a.status}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell text-muted text-[11.5px]">
                        {a.site_name || a.site_url || "—"}
                      </td>
                      <td className="hidden md:table-cell text-muted text-[11.5px]">
                        {a.schedule_name || <span className="text-muted-2">one-off</span>}
                      </td>
                      <td className="text-muted text-[11.5px]">{timeAgo(a.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
