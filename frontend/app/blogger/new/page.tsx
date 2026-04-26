"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";
import { LENGTH_LABEL, type LengthTarget, type PublishStatus, type WpConnection } from "@/lib/blogger";

export default function NewArticlePage() {
  const router = useRouter();
  const [conns, setConns] = useState<WpConnection[]>([]);
  const [connectionId, setConnectionId] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("");
  const [length, setLength] = useState<LengthTarget>("medium");
  const [publish, setPublish] = useState<PublishStatus>("draft");
  const [withImage, setWithImage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/blogger/connections")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: WpConnection[]) => {
        setConns(d);
        if (d.length === 1) setConnectionId(d[0].id);
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!connectionId || !topic.trim()) {
      setErr("Pick a site and enter a topic.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/blogger/articles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connectionId,
          topic: topic.trim(),
          tone: tone.trim() || undefined,
          length,
          publish_status: publish,
          generate_image: withImage,
        }),
      });
      const data = (await r.json()) as { article_id?: string; error?: string };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      router.push("/blogger/articles");
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Shell active="blogger" crumbs={["Auto Blogger", "One-off article"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-[640px]">
          <Link href="/blogger" className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1 mb-3">
            ← Back
          </Link>
          <h1 className="text-[20px] md:text-[22px] mb-1.5">Generate one article</h1>
          <p className="text-[13.5px] text-muted mb-6">
            Useful for testing the connection or one-off posts. Each article counts as 1 credit on your plan.
          </p>

          {conns.length === 0 ? (
            <div className="card p-5 text-center">
              <div className="text-[14px] font-medium mb-2">Connect a WordPress site first</div>
              <Link href="/blogger/connect" className="btn-primary">Connect WordPress</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="card p-5 grid gap-4">
              <div>
                <label className="label">Site</label>
                <select
                  className="input"
                  value={connectionId}
                  onChange={(e) => setConnectionId(e.target.value)}
                  required
                >
                  <option value="">Choose a site…</option>
                  {conns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.site_name || c.site_url}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Topic</label>
                <input
                  className="input"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. How to choose the right WooCommerce shipping plugin"
                  required
                />
              </div>
              <div>
                <label className="label">Tone <span className="text-muted-2 font-normal">(optional)</span></label>
                <input
                  className="input"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="e.g. punchy, conversational; or technical and precise"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Length</label>
                  <select className="input" value={length} onChange={(e) => setLength(e.target.value as LengthTarget)}>
                    {(["short", "medium", "long"] as LengthTarget[]).map((l) => (
                      <option key={l} value={l}>{LENGTH_LABEL[l]}</option>
                    ))}
                  </select>
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
                Generate a featured image (DALL·E 3)
              </label>
              {err && <div className="p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}
              <div className="flex justify-end gap-2 mt-1">
                <Link href="/blogger" className="btn">Cancel</Link>
                <button type="submit" disabled={submitting} className="btn-primary btn-lg">
                  {submitting ? "Generating…" : <>Generate &amp; post <Icons.ArrowRight size={14} /></>}
                </button>
              </div>
              <div className="text-[11px] text-muted-2 leading-[1.55]">
                Generation usually takes 30-90 seconds (writing + optional image + WP upload). The page will redirect to your article history when it's done.
              </div>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}
