"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Icons } from "@/components/Icons";
import { KeywordGeneratorModal } from "@/components/KeywordGeneratorModal";
import {
  CADENCE_LABEL,
  LENGTH_LABEL,
  type Cadence,
  type LengthTarget,
  type PublishStatus,
  type WpConnection,
} from "@/lib/blogger";

export interface ScheduleFormValues {
  name: string;
  wp_connection_id: string;
  topics: string[];
  tone: string | null;
  length_target: LengthTarget;
  cadence: Cadence;
  publish_status: PublishStatus;
  generate_image: boolean;
}

interface Props {
  /** Pre-filled values; undefined fields use defaults. Pass for edit mode. */
  initial?: Partial<ScheduleFormValues>;
  /** Disable changing the target site in edit mode (would orphan past articles). */
  lockConnection?: boolean;
  /** Submit button copy. */
  submitLabel: string;
  /** Active-form copy while submitting. */
  submitActiveLabel: string;
  /** Called with the form values when the user submits. Throw to surface an error. */
  onSubmit: (values: ScheduleFormValues) => Promise<void>;
  /** Optional sub-line under the H1, e.g. an explanatory note. */
  helpText?: React.ReactNode;
}

/**
 * Reusable form for creating or editing a blog schedule. Used by both
 * /blogger/schedules/new and /blogger/schedules/[id]/edit so the field
 * list and validation only live in one place.
 */
export function ScheduleForm({
  initial,
  lockConnection = false,
  submitLabel,
  submitActiveLabel,
  onSubmit,
  helpText,
}: Props) {
  const [conns, setConns] = useState<WpConnection[]>([]);
  const [name, setName] = useState(initial?.name ?? "");
  const [connectionId, setConnectionId] = useState(initial?.wp_connection_id ?? "");
  const [topicsText, setTopicsText] = useState((initial?.topics ?? []).join("\n"));
  const [tone, setTone] = useState(initial?.tone ?? "");
  const [length, setLength] = useState<LengthTarget>(initial?.length_target ?? "medium");
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? "24h");
  const [publish, setPublish] = useState<PublishStatus>(initial?.publish_status ?? "draft");
  const [withImage, setWithImage] = useState(initial?.generate_image ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Live token balance so the user can see whether the first article
  // will fire. -1 means admin / unlimited; null means we haven't
  // loaded it yet.
  const [tokens, setTokens] = useState<number | null>(null);
  // Keyword-generator modal is opt-in (user clicks the button).
  const [kwModalOpen, setKwModalOpen] = useState(false);

  useEffect(() => {
    fetch("/api/blogger/connections")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: WpConnection[]) => {
        setConns(d);
        // Auto-select the single connection on create.
        if (!initial?.wp_connection_id && d.length === 1) setConnectionId(d[0].id);
      });
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const bal = d?.tokens?.balance;
        if (typeof bal === "number") setTokens(bal);
      })
      .catch(() => { /* non-fatal */ });
    // Only run once on mount — caller-supplied initial doesn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstArticleCost = withImage ? 10 : 5;
  const insufficient = tokens !== null && tokens !== -1 && tokens < firstArticleCost;

  const topics = topicsText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim() || !connectionId || topics.length === 0) {
      setErr("Name, site, and at least one topic are required.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        wp_connection_id: connectionId,
        topics,
        tone: tone.trim() || null,
        length_target: length,
        cadence,
        publish_status: publish,
        generate_image: withImage,
      });
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  if (conns.length === 0 && !initial) {
    return (
      <div className="card p-5 text-center">
        <div className="text-[14px] font-medium mb-2">Connect a WordPress site first</div>
        <Link href="/blogger/connect" className="btn-primary">Connect WordPress</Link>
      </div>
    );
  }

  // Reuse the human-friendly site label for the modal header.
  const activeConn = conns.find((c) => c.id === connectionId);
  const siteLabel = activeConn?.site_name || activeConn?.site_url;

  return (
    <>
    <form onSubmit={handleSubmit} className="card p-5 grid gap-4">
      {helpText && <div className="text-[12.5px] text-muted -mt-1">{helpText}</div>}
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
        <select
          className="input"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value)}
          required
          disabled={lockConnection}
        >
          <option value="">Choose a site…</option>
          {conns.map((c) => (
            <option key={c.id} value={c.id}>{c.site_name || c.site_url}</option>
          ))}
        </select>
        {lockConnection && (
          <div className="mt-1 text-[11.5px] text-muted-2">
            Site is locked on edit — past articles stay linked to this connection.
          </div>
        )}
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <label className="label !mb-0 flex-1">Keywords</label>
          <button
            type="button"
            disabled={!connectionId}
            onClick={() => setKwModalOpen(true)}
            className="btn-sm"
            title={connectionId ? "AI-generate keywords from your site" : "Pick a site first"}
          >
            <Icons.Sparkle size={12} /> Generate keywords
          </button>
        </div>
        <textarea
          className="input"
          rows={6}
          value={topicsText}
          onChange={(e) => setTopicsText(e.target.value)}
          placeholder={"One keyword per line, e.g.:\nbest budget OBD2 scanners\nhow to install Miata coilovers\nwinter car prep checklist"}
          required
        />
        <div className="mt-1 text-[11.5px] text-muted-2">
          {topics.length} keyword{topics.length === 1 ? "" : "s"} parsed. We round-robin through them — each run picks the next one. Each keyword becomes one article&apos;s primary topic.
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Cadence</label>
          <select className="input" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
            {(["10min", "30min", "1h", "2h", "5h", "12h", "24h", "48h"] as Cadence[]).map((c) => (
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
        <input
          type="checkbox"
          checked={withImage}
          onChange={(e) => setWithImage(e.target.checked)}
          style={{ accentColor: "var(--ink)" }}
        />
        Generate a featured image with each article
      </label>
      {/* Cost / balance preview — makes "do I have enough?" obvious
          before the user hits Submit, and warns loudly when the first
          article (which fires immediately) won't be affordable. */}
      {tokens !== null && tokens !== -1 && (
        <div
          className={`p-3 rounded-md text-[12.5px] ${insufficient ? "bg-warn-soft text-warn-ink" : "bg-surface2"}`}
          style={!insufficient ? { borderColor: "var(--line)", borderWidth: 1, borderStyle: "solid" } : undefined}
        >
          {insufficient ? (
            <>
              <div className="font-medium mb-1">
                You don&apos;t have enough tokens for the first article.
              </div>
              <div>
                This schedule will use <strong>{firstArticleCost} tokens</strong> per post (the first one fires immediately).
                You have <strong>{tokens.toLocaleString()}</strong>.{" "}
                <Link href="/pricing" className="underline">Top up</Link> and come back.
              </div>
            </>
          ) : (
            <>
              <div className="font-medium mb-1">
                {firstArticleCost} tokens / post · You have {tokens.toLocaleString()} → roughly {Math.floor(tokens / firstArticleCost)} posts.
              </div>
              <div className="text-muted">
                The first article publishes immediately after you click Create. Cost: {firstArticleCost} tokens
                {withImage ? " (5 without the featured image)" : " (10 with a featured image)"}.
              </div>
            </>
          )}
        </div>
      )}

      {err && <div className="p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>}
      <div className="flex justify-end gap-2 mt-1">
        <Link href="/blogger" className="btn">Cancel</Link>
        <button type="submit" disabled={submitting || insufficient} className="btn-primary btn-lg">
          {submitting ? submitActiveLabel : <>{submitLabel} <Icons.ArrowRight size={14} /></>}
        </button>
      </div>
      <div className="text-[11px] text-muted-2 leading-[1.55]">
        Cron ticks every 10 minutes. Each article costs 5 tokens (10 with featured image). Pause or delete a schedule any time.
      </div>
    </form>

    {kwModalOpen && connectionId && (
      <KeywordGeneratorModal
        connectionId={connectionId}
        siteLabel={siteLabel}
        onUse={(picked) => {
          // Append (don't replace) so the user keeps any keywords they
          // typed in manually. Deduplicate against existing entries.
          const existing = new Set(topics.map((t) => t.toLowerCase()));
          const fresh = picked.filter((k) => !existing.has(k.toLowerCase()));
          const merged = [...topics, ...fresh];
          setTopicsText(merged.join("\n"));
          setKwModalOpen(false);
        }}
        onClose={() => setKwModalOpen(false)}
      />
    )}
    </>
  );
}
