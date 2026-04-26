"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { STATUS_CHIP, STATUS_LABEL, timeAgo, type Ticket } from "@/lib/tickets";

export default function TicketsPage() {
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/tickets")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => { setRows(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  return (
    <Shell active="tickets" crumbs={["Help"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Help</h1>
            <p className="text-[13.5px] text-muted mt-1">
              Open a ticket and we'll get back to you. Replies show up here in real time.
            </p>
          </div>
          <div className="sm:flex-1" />
          <Link href="/tickets/new" className="btn-primary self-start sm:self-auto">
            <Icons.Plus size={14} /> New ticket
          </Link>
        </div>

        {!loaded ? (
          <div className="text-muted text-sm py-10 text-center">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="card px-6 py-16 text-center max-w-[480px] mx-auto">
            <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4 bg-line-2">
              <Icons.Sparkle size={20} className="text-muted" />
            </div>
            <div className="text-[16px] font-[560] mb-2">No tickets yet</div>
            <p className="text-[13px] text-muted mb-6 leading-[1.55]">
              Hit a problem? Open a ticket and we'll help — usually within a few hours.
            </p>
            <Link href="/tickets/new" className="btn-primary btn-lg">
              <Icons.Plus size={14} /> Open your first ticket
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Status</th>
                    <th className="hidden sm:table-cell">Messages</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className="cursor-pointer" onClick={() => (window.location.href = `/tickets/${t.id}`)}>
                      <td className="max-w-[360px]">
                        <div className="font-medium text-ink truncate">{t.subject}</div>
                        {t.related_crawl_id && (
                          <div className="text-[11px] text-muted-2 font-mono">extract {t.related_crawl_id.slice(0, 8)}</div>
                        )}
                      </td>
                      <td>
                        <span className={`chip ${STATUS_CHIP[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                        {(t.unread_for_user || 0) > 0 && (
                          <span className="ml-1.5 chip chip-warn">{t.unread_for_user} new</span>
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
        )}
      </div>
    </Shell>
  );
}
