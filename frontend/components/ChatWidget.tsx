"use client";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Icons } from "./Icons";
import {
  STATUS_CHIP,
  STATUS_LABEL,
  timeAgo,
  type Ticket,
  type TicketMessage,
} from "@/lib/tickets";

type View = "closed" | "list" | "thread" | "new";

const POLL_OPEN_MS = 4000;
const POLL_CLOSED_MS = 30_000;

/**
 * Floating live-chat widget. Mounted by the user `Shell` so it appears on
 * every signed-in non-admin page. Bubble in the bottom-right opens a 360px
 * panel that swaps between three views:
 *
 *   - list   → recent tickets, "New" button on top
 *   - thread → one ticket's full chat (polled every 4s)
 *   - new    → subject + message form. If the user is on /crawls/<id> the
 *              ticket is auto-linked to that crawl.
 *
 * Unread admin-reply count is polled even while closed (every 30s) so the
 * red badge stays current.
 */
export function ChatWidget() {
  const { data: session } = useSession();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  const isAdmin = !!(session?.user as { is_admin?: boolean } | undefined)?.is_admin;

  const [view, setView] = useState<View>("closed");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [unread, setUnread] = useState(0);

  // Don't render for anonymous visitors or admins (admins use /admin/tickets).
  const enabled = !!session?.user && !isAdmin && Number.isFinite(userId);

  // Unread badge poll — runs always while signed in.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/me/unread");
        if (!r.ok) return;
        const d = (await r.json()) as { user_unread?: number };
        if (alive) setUnread(d.user_unread || 0);
      } catch { /* ignore */ }
    };
    tick();
    const ms = view === "closed" ? POLL_CLOSED_MS : POLL_OPEN_MS;
    const t = setInterval(tick, ms);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, view]);

  // List poll — only while the list view is open.
  useEffect(() => {
    if (!enabled || view !== "list") return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/tickets");
        if (!r.ok) return;
        const d = (await r.json()) as Ticket[];
        if (alive) setTickets(d);
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, POLL_OPEN_MS);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, view]);

  // Thread poll — only while a ticket is open.
  useEffect(() => {
    if (!enabled || view !== "thread" || !activeId) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/tickets/${activeId}`);
        if (!r.ok) return;
        const d = (await r.json()) as { ticket: Ticket; messages: TicketMessage[] };
        if (!alive) return;
        setActiveTicket(d.ticket);
        setMessages(d.messages);
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, POLL_OPEN_MS);
    return () => { alive = false; clearInterval(t); };
  }, [enabled, view, activeId]);

  if (!enabled) return null;

  const open = view !== "closed";

  return (
    <>
      {/* Mobile backdrop. Desktop has no overlay so users can keep working. */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 sm:hidden"
          onClick={() => setView("closed")}
          aria-hidden
        />
      )}

      <div
        className={`fixed z-50 ${open ? "inset-x-3 bottom-3 sm:inset-auto sm:bottom-4 sm:right-4" : "bottom-4 right-4"}`}
      >
        {!open ? (
          <button
            onClick={() => setView(tickets.length === 0 ? "new" : "list")}
            className="relative w-14 h-14 rounded-full grid place-items-center transition-transform hover:scale-105"
            style={{
              background: "var(--ink)",
              color: "var(--bg)",
              boxShadow: "0 8px 24px -8px rgba(14,14,12,0.35)",
            }}
            aria-label="Open help chat"
          >
            <Icons.Bell size={22} />
            {unread > 0 && (
              <span
                className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full text-white text-[11px] font-semibold grid place-items-center"
                style={{ background: "var(--danger)" }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        ) : (
          <div
            className="bg-white border border-line rounded-xl flex flex-col overflow-hidden"
            style={{
              width: "min(360px, 100%)",
              height: "min(560px, calc(100dvh - 24px))",
              boxShadow: "0 24px 64px -12px rgba(14,14,12,0.35)",
            }}
          >
            {view === "list" && (
              <ListView
                tickets={tickets}
                onClose={() => setView("closed")}
                onNew={() => setView("new")}
                onPick={(id) => { setActiveId(id); setView("thread"); }}
              />
            )}
            {view === "thread" && activeId && (
              <ThreadView
                ticket={activeTicket}
                messages={messages}
                myUserId={userId}
                onBack={() => { setActiveId(null); setActiveTicket(null); setMessages([]); setView("list"); }}
                onClose={() => setView("closed")}
                onSent={async () => {
                  // Refresh thread immediately after a send.
                  const r = await fetch(`/api/tickets/${activeId}`);
                  if (r.ok) {
                    const d = (await r.json()) as { ticket: Ticket; messages: TicketMessage[] };
                    setActiveTicket(d.ticket);
                    setMessages(d.messages);
                  }
                }}
                ticketId={activeId}
              />
            )}
            {view === "new" && (
              <NewView
                onCancel={() => setView(tickets.length === 0 ? "closed" : "list")}
                onClose={() => setView("closed")}
                onCreated={(id) => { setActiveId(id); setView("thread"); }}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ---------- Sub-views ----------

function PanelHeader({
  title,
  onBack,
  onClose,
  rightHref,
}: {
  title: string;
  onBack?: () => void;
  onClose: () => void;
  rightHref?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 border-b border-line bg-surface2">
      {onBack && (
        <button onClick={onBack} className="btn-ghost btn-icon" aria-label="Back">
          <Icons.ChevronLeft size={16} />
        </button>
      )}
      <div className="text-[14px] font-medium flex-1 truncate">{title}</div>
      {rightHref && (
        <Link href={rightHref} className="text-[11.5px] text-muted hover:text-ink">
          Open full
        </Link>
      )}
      <button onClick={onClose} className="btn-ghost btn-icon" aria-label="Close">
        <Icons.X size={16} />
      </button>
    </div>
  );
}

function ListView({
  tickets,
  onClose,
  onNew,
  onPick,
}: {
  tickets: Ticket[];
  onClose: () => void;
  onNew: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <PanelHeader title="Help" onClose={onClose} rightHref="/tickets" />
      <div className="px-3 pt-3">
        <button onClick={onNew} className="btn-primary btn-sm w-full justify-center">
          <Icons.Plus size={12} /> New conversation
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {tickets.length === 0 ? (
          <div className="text-[12.5px] text-muted text-center px-4 py-8">
            No conversations yet. Open one whenever you need help — typical reply time is a few hours.
          </div>
        ) : (
          tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => onPick(t.id)}
              className="w-full text-left px-2.5 py-2.5 rounded-md hover:bg-line-2"
            >
              <div className="flex items-center gap-2">
                <div className="text-[13px] font-medium text-ink truncate flex-1">{t.subject}</div>
                {(t.unread_for_user || 0) > 0 && (
                  <span
                    className="text-[10px] font-semibold px-1.5 rounded-full text-white"
                    style={{ background: "var(--danger)", minWidth: 18, textAlign: "center" }}
                  >
                    {t.unread_for_user}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 text-[11px]">
                <span className={`chip ${STATUS_CHIP[t.status]}`} style={{ height: 16, padding: "0 6px", fontSize: 10 }}>
                  {STATUS_LABEL[t.status]}
                </span>
                <span className="text-muted">{timeAgo(t.updated_at)}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </>
  );
}

function ThreadView({
  ticket,
  messages,
  myUserId,
  ticketId,
  onBack,
  onClose,
  onSent,
}: {
  ticket: Ticket | null;
  messages: TicketMessage[];
  myUserId: number;
  ticketId: string;
  onBack: () => void;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch(`/api/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      setDraft("");
      onSent();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  const isClosed = ticket?.status === "closed";

  return (
    <>
      <PanelHeader
        title={ticket?.subject ?? "Loading…"}
        onBack={onBack}
        onClose={onClose}
        rightHref={`/tickets/${ticketId}`}
      />
      {ticket && (
        <div className="px-3 py-1.5 border-b border-line-2 flex items-center gap-2 text-[11px]">
          <span className={`chip ${STATUS_CHIP[ticket.status]}`} style={{ height: 16, padding: "0 6px", fontSize: 10 }}>
            {STATUS_LABEL[ticket.status]}
          </span>
          {ticket.related_crawl_id && (
            <Link href={`/crawls/${ticket.related_crawl_id}`} className="text-muted hover:text-ink truncate">
              extract {ticket.related_crawl_id.slice(0, 8)}
            </Link>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="text-muted text-[12.5px] text-center py-6">No messages yet.</div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_user_id === myUserId && m.sender_role === "user";
            const fromAdmin = m.sender_role === "admin";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[88%] rounded-lg px-3 py-2 text-[12.5px] leading-[1.45] whitespace-pre-wrap break-words"
                  style={{
                    background: mine ? "var(--ink)" : fromAdmin ? "var(--accent-soft)" : "var(--line-2)",
                    color: mine ? "var(--bg)" : "var(--ink)",
                  }}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-70 mb-0.5 font-mono">
                    {mine ? "You" : fromAdmin ? "Prodlyft team" : "User"} · {timeAgo(m.created_at)}
                  </div>
                  {m.body}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {isClosed ? (
        <div className="px-3 py-3 border-t border-line text-[11.5px] text-muted text-center">
          This ticket is closed. <button onClick={onBack} className="text-ink underline">Open a new one</button> if you need more help.
        </div>
      ) : (
        <form onSubmit={send} className="border-t border-line p-2 flex gap-1.5 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(e as unknown as FormEvent);
              }
            }}
            placeholder="Type a message… (Enter to send)"
            rows={1}
            className="input flex-1 text-[12.5px]"
            style={{ resize: "none", minHeight: 36, maxHeight: 120 }}
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn-primary btn-sm">
            <Icons.ArrowRight size={14} />
          </button>
        </form>
      )}
      {err && <div className="px-3 pb-2 text-[11px] text-danger text-center">{err}</div>}
    </>
  );
}

function NewView({
  onCancel,
  onClose,
  onCreated,
}: {
  onCancel: () => void;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Auto-link to the crawl page the user is currently viewing, if any.
  const inferredCrawlId =
    typeof window !== "undefined"
      ? window.location.pathname.match(/^\/crawls\/([^/?#]+)/)?.[1] ?? null
      : null;

  useEffect(() => {
    if (inferredCrawlId && !subject) {
      setSubject(`Help with extract ${inferredCrawlId.slice(0, 8)}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!subject.trim() || !body.trim()) {
      setErr("Subject and message are required.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          related_crawl_id: inferredCrawlId,
        }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      const { id } = (await r.json()) as { id: string };
      onCreated(id);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <>
      <PanelHeader title="New conversation" onBack={onCancel} onClose={onClose} />
      <form onSubmit={submit} className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {inferredCrawlId && (
          <div className="text-[11px] text-muted bg-surface2 border border-line rounded-md px-2.5 py-1.5">
            Linking to extract <span className="font-mono font-medium text-ink">{inferredCrawlId.slice(0, 8)}</span>
          </div>
        )}
        <div>
          <label className="label">Subject</label>
          <input
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short description"
            maxLength={255}
            required
          />
        </div>
        <div className="flex-1 flex flex-col">
          <label className="label">Message</label>
          <textarea
            className="input flex-1"
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What were you trying to do? What happened instead?"
            required
            style={{ resize: "none" }}
          />
        </div>
        {err && <div className="text-[11.5px] text-danger">{err}</div>}
        <button type="submit" disabled={submitting} className="btn-primary btn-lg justify-center">
          {submitting ? "Sending…" : <>Send <Icons.ArrowRight size={14} /></>}
        </button>
      </form>
    </>
  );
}
