"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import {
  CADENCE_LABEL,
  LENGTH_LABEL,
  type Cadence,
  type LengthTarget,
  type PublishStatus,
  type WpConnection,
} from "@/lib/blogger";

export default function NewSchedulePage() {
  const router = useRouter();
  const [conns, setConns] = useState<WpConnection[]>([]);
  const [name, setName] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [topicsText, setTopicsText] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState<LengthTarget>("medium");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [publish, setPublish] = useState<PublishStatus>("draft");
  const [withImage, setWithImage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/blogger/connections").then((r) => r.ok ? r.json() : []).then((d: WpConnection[]) => {
      setConns(d);
      if (d.length === 1) setConnectionId(d[0].id);
    });
  }, []);

  const topics = topicsText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !connectionId || topics.length === 0) {
      setErr("Name, site, and at least one topic are required.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/blogger/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          wp_connection_id: connectionId,
          topics,
          tone: tone.trim() || undefined,
          length_target: length,
          cadence,
          publish_status: publish,
          generate_image: withImage,
        }),
      });
      const data = (await r.json()) as { id?: string; error?: string };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      router.push("/blogger");
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Shell active="blogger" crumbs={["Auto Blogger", "New schedule"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-[680px]">
          <Link href="/blogger" className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1 mb-3">
            ← Back
          </Link>
          <h1 className="text-[20px] md:text-[22px] mb-1.5">New publishing schedule</h1>
          <p className="text-[13.5px] text-muted mb-6">
            We'll cycle through your topics on the cadence you pick, generating one article per run.
          </p>

          {conns.length === 0 ? (
            <div className="card p-5 text-center">
              <div className="text-[14px] font-medium mb-2">Connect a WordPress site first</div>
              <Link href="/blogger/connect" className="btn-primary">Connect WordPress</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="card p-5 grid gap-4">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Weekly SEO posts for the auto-parts blog"
                  required
                />
              </div>
              <div>
                <label className="label">Target site</label>
                <select className="input" value={connectionId} onChange={(e) => setConnectionId(e.target.value)} required>
                  <option value="">Choose a site…</option>
                  {conns.map((c) => (
                    <option key={c.id} value={c.id}>{c.site_name || c.site_url}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Topics</label>
                <textarea
                  className="input"
                  rows={6}
                  value={topicsText}
                  onChange={(e) => setTopicsText(e.target.value)}
                  placeholder={"One topic per line, e.g.:\nHow to install a Mazda Miata coilover kit\nBest budget OBD2 scanners under $50\n10 winter prep tips for daily drivers"}
                  required
                />
                <div className="mt-1 text-[11.5px] text-muted-2">
                  {topics.length} topic{topics.length === 1 ? "" : "s"} parsed. We round-robin through them — each run picks the next one.
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Cadence</label>
                  <select className="input" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
                    {(["hourly", "daily", "weekly", "monthly"] as Cadence[]).map((c) => (
                      <option key={c} value={c}>{CADENCE_LABEL[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Length</label>
                  <select className="input" value={length} onChange={(e) => setLength(e.target.value as LengthTarget)}>
                    {(["short", "medium", "long"] as LengthTarget[]).map((l) => (
                      <option key={l} value={l}>{LENGTH_LABEL[l]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Tone <span className="text-muted-2 font-normal">(optional)</span></label>
                  <input className="input" value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. friendly and beginner-friendly" />
                </div>
                <div>
                  <label className="label">Publish as</label>
                  <select className="input" value={publish} onChange={(e) => setPublish(e.target.value as PublishStatus)}>
                    <option value="draft">Draft (review in WP first)</option>
                    <option value="publish">Publish immediately</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={withImage} onChange={(e) => setWithImage(e.target.checked)} style={{ accentColor: "var(--ink)" }} />
                Generate a featured image with each article (DALL·E 3)
              </label>
              {err && <div className="p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}
              <div className="flex justify-end gap-2 mt-1">
                <Link href="/blogger" className="btn">Cancel</Link>
                <button type="submit" disabled={submitting} className="btn-primary btn-lg">
                  {submitting ? "Saving…" : <>Create schedule <Icons.ArrowRight size={14} /></>}
                </button>
              </div>
              <div className="text-[11px] text-muted-2 leading-[1.55]">
                We check schedules every hour. Each fired article counts as 1 credit on your plan. Disable or delete a schedule any time.
              </div>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
