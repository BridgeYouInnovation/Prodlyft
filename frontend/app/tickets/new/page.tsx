"use client";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";

export default function NewTicketPage() {
  return (
    <Shell active="tickets" crumbs={["Help", "New ticket"]}>
      <Suspense fallback={<div className="text-muted text-sm py-10 text-center">Loading…</div>}>
        <Body />
      </Suspense>
    </Shell>
  );
}

function Body() {
  const router = useRouter();
  const search = useSearchParams();
  const crawlId = search.get("crawl");
  const presetSubject = search.get("subject");

  const [subject, setSubject] = useState(presetSubject || (crawlId ? "Help with extract" : ""));
  const [body, setBody] = useState(
    crawlId
      ? `My extract (${crawlId.slice(0, 8)}) didn't work as expected. \n\nWhat I tried:\n- \n\nWhat happened:\n- `
      : "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!subject.trim() || !body.trim()) {
      setErr("Subject and message are both required.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), related_crawl_id: crawlId }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const { id } = (await r.json()) as { id: string };
      router.push(`/tickets/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
      <div className="max-w-[640px]">
        <h1 className="text-[20px] md:text-[22px] mb-1.5">Open a ticket</h1>
        <p className="text-[13.5px] text-muted mb-6">
          We usually reply within a few hours during business hours.
        </p>

        {crawlId && (
          <div className="mb-5 p-3 rounded-md text-[12.5px] flex items-center gap-2 bg-surface2 border border-line">
            <Icons.Link size={13} className="text-muted" />
            Linking this ticket to extract{" "}
            <Link href={`/crawls/${crawlId}`} className="font-mono font-medium text-ink hover:underline">
              {crawlId.slice(0, 8)}
            </Link>
          </div>
        )}

        {err && (
          <div className="mb-5 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>
        )}

        <form onSubmit={onSubmit} className="card p-5 flex flex-col gap-4">
          <div>
            <label className="label">Subject</label>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Short description of the problem"
              required
              maxLength={255}
            />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea
              className="input"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What were you trying to do? What happened instead?"
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Link href="/tickets" className="btn">Cancel</Link>
            <button type="submit" disabled={submitting} className="btn-primary btn-lg">
              {submitting ? "Sending…" : <>Send <Icons.ArrowRight size={14} /></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
