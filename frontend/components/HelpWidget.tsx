"use client";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Icons } from "./Icons";
import { AttachmentPicker, type PendingAttachment } from "./AttachmentPicker";

/**
 * Floating help button rendered on every page (mounted from the root
 * Providers). Lets any signed-in user open a ticket inline; anonymous
 * visitors get bounced to sign-in. Hidden on the admin shell so admins
 * don't accidentally file tickets to themselves.
 */
export function HelpWidget() {
  const path = usePathname();
  const { data: session, status: authStatus } = useSession();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [sentId, setSentId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Hide on admin pages — admins answer tickets, they don't open them.
  const hiddenPaths = ["/admin"];
  if (path && hiddenPaths.some((p) => path === p || path.startsWith(p + "/"))) return null;

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!subject.trim() || !message.trim()) {
      setErr("Subject and message are both required.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: message.trim(),
          attachments: attachments.map((a) => ({
            filename: a.filename,
            content_type: a.content_type,
            data_url: a.data_url,
          })),
        }),
      });
      const data = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !data.id) throw new Error(data.error || `HTTP ${r.status}`);
      setSentId(data.id);
      setSubject("");
      setMessage("");
      // Release the preview Object URLs we created so the browser
      // doesn't keep the blobs in memory.
      for (const a of attachments) {
        try { URL.revokeObjectURL(a.preview_url); } catch { /* ignore */ }
      }
      setAttachments([]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function resetAfterSend() {
    setSentId(null);
    setOpen(false);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      {open && (
        <div
          ref={panelRef}
          className="mb-2 w-[320px] sm:w-[360px] bg-white border border-line rounded-lg overflow-hidden"
          style={{ boxShadow: "0 24px 64px -16px rgba(14,14,12,0.32)" }}
          role="dialog"
          aria-label="Open a support ticket"
        >
          <div className="px-4 py-3 flex items-center gap-2 border-b border-line-2">
            <Icons.Bell size={14} />
            <div className="text-[13px] font-medium">Need help?</div>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-2 hover:text-ink"
              aria-label="Close"
            >
              <Icons.X size={14} />
            </button>
          </div>

          {sentId ? (
            <div className="p-4 text-center">
              <div className="w-9 h-9 rounded-full grid place-items-center mx-auto mb-2"
                style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
                <Icons.Check size={16} />
              </div>
              <div className="text-[14px] font-[560] mb-1">Ticket opened</div>
              <div className="text-[12px] text-muted mb-4">
                We&apos;ll reply by email. You can also track the thread on your tickets page.
              </div>
              <div className="flex gap-2 justify-center">
                <Link href={`/tickets/${sentId}`} className="btn-sm" onClick={resetAfterSend}>
                  View ticket
                </Link>
                <button type="button" onClick={resetAfterSend} className="btn-sm btn-ghost">
                  Close
                </button>
              </div>
            </div>
          ) : authStatus === "loading" ? (
            <div className="p-4 text-center text-[12.5px] text-muted">Loading…</div>
          ) : !session?.user ? (
            <div className="p-4 text-center">
              <div className="text-[12.5px] text-muted mb-3 leading-[1.55]">
                Sign in or create a free account to open a support ticket. We track every
                thread and reply by email.
              </div>
              <Link
                href={`/signin?callbackUrl=${encodeURIComponent(path || "/")}`}
                className="btn-primary btn-sm"
                onClick={() => setOpen(false)}
              >
                Sign in to continue
              </Link>
              <div className="text-[11px] text-muted-2 mt-3">
                Or email <a className="underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a> directly.
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="p-3 grid gap-2">
              <input
                className="input"
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={120}
                required
              />
              <textarea
                className="input"
                rows={5}
                placeholder="What's going on? Attach screenshots below if it helps."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={4000}
                required
              />
              <AttachmentPicker value={attachments} onChange={setAttachments} />
              {err && (
                <div className="text-[12px] text-warn-ink bg-warn-soft rounded-md px-2 py-1.5">
                  {err}
                </div>
              )}
              <button type="submit" disabled={submitting} className="btn-primary btn-sm justify-center">
                {submitting ? "Sending…" : "Send ticket"}
              </button>
              <div className="text-[10.5px] text-muted-2 text-center">
                You can also view past threads at{" "}
                <Link href="/tickets" className="underline" onClick={() => setOpen(false)}>
                  /tickets
                </Link>.
              </div>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close help" : "Open help"}
        className="rounded-full grid place-items-center transition-transform hover:scale-105"
        style={{
          width: 48,
          height: 48,
          background: "var(--ink)",
          color: "#fff",
          boxShadow: "0 12px 28px -8px rgba(14,14,12,0.4)",
        }}
      >
        {open ? <Icons.X size={18} /> : <Icons.Bell size={18} />}
      </button>
    </div>
  );
}
