"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  STATUS_CHIP,
  STATUS_LABEL,
  type Ticket,
  type TicketMessage,
  timeAgo,
} from "@/lib/tickets";

const POLL_MS = 3500;

/**
 * Live-chat thread for one ticket. Polls the server for new messages.
 * `apiBase` differs between user and admin contexts:
 *   - user:  /api/tickets/{id}
 *   - admin: /api/admin/tickets/{id}
 * `messagesBase`:
 *   - user:  /api/tickets/{id}/messages
 *   - admin: /api/admin/tickets/{id}/messages
 */
export function TicketThread({
  ticketId,
  apiBase,
  messagesBase,
  isAdmin,
  myUserId,
  onTicketChange,
}: {
  ticketId: string;
  apiBase: string;
  messagesBase: string;
  isAdmin: boolean;
  myUserId: number | null;
  onTicketChange?: (t: Ticket) => void;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch(apiBase, { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { ticket: Ticket; messages: TicketMessage[] };
      setTicket(d.ticket);
      setMessages(d.messages);
      onTicketChange?.(d.ticket);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  // Initial fetch + poll loop.
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  // Auto-scroll to bottom on new messages.
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
      const r = await fetch(messagesBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      setDraft("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function setStatus(s: string) {
    try {
      const r = await fetch(apiBase, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: s }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (!ticket) {
    return <div className="text-muted text-sm py-10 text-center">Loading thread…</div>;
  }

  const isClosed = ticket.status === "closed";

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="card p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-[560] tracking-tight2 mb-1 break-words">{ticket.subject}</div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <span className={`chip ${STATUS_CHIP[ticket.status]}`}>{STATUS_LABEL[ticket.status]}</span>
              <span>Opened {timeAgo(ticket.created_at)}</span>
              {ticket.related_crawl_id && (
                <a href={`/crawls/${ticket.related_crawl_id}`} className="text-ink hover:underline">
                  Related extract → {ticket.related_crawl_id.slice(0, 8)}
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {isAdmin && !isClosed && (
              <>
                <button onClick={() => setStatus("waiting_user")} className="btn-sm">Mark waiting on user</button>
                <button onClick={() => setStatus("closed")} className="btn-sm">Close</button>
              </>
            )}
            {isAdmin && isClosed && (
              <button onClick={() => setStatus("open")} className="btn-sm">Re-open</button>
            )}
            {!isAdmin && !isClosed && (
              <button onClick={() => setStatus("closed")} className="btn-sm btn-ghost">Close ticket</button>
            )}
          </div>
        </div>
      </div>

      {/* Thread */}
      <div className="card p-4 md:p-5 flex flex-col gap-3 min-h-[300px] max-h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-muted text-sm py-8 text-center">No messages yet.</div>
        ) : (
          messages.map((m) => {
            const mine = myUserId !== null && m.sender_user_id === myUserId && m.sender_role === (isAdmin ? "admin" : "user");
            const fromAdmin = m.sender_role === "admin";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-lg px-3.5 py-2.5 text-[13px] leading-[1.5] whitespace-pre-wrap break-words`}
                  style={{
                    background: mine
                      ? "var(--ink)"
                      : fromAdmin
                      ? "var(--accent-soft)"
                      : "var(--line-2)",
                    color: mine ? "var(--bg)" : "var(--ink)",
                  }}
                >
                  <div className="text-[10.5px] uppercase tracking-wider opacity-70 mb-1 font-mono">
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

      {/* Composer */}
      {isClosed ? (
        <div className="card p-4 text-center text-[12.5px] text-muted">
          This ticket is closed. {isAdmin ? "Re-open it above to reply." : "Open a new ticket if you need more help."}
        </div>
      ) : (
        <form onSubmit={send} className="card p-3 flex gap-2 items-end">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(e as unknown as FormEvent);
              }
            }}
            placeholder={isAdmin ? "Reply to the user…" : "Type your message…"}
            rows={2}
            className="input flex-1"
            style={{ resize: "vertical" }}
          />
          <button type="submit" disabled={sending || !draft.trim()} className="btn-primary btn-lg">
            {sending ? "Sending…" : "Send"}
          </button>
        </form>
      )}

      {err && <div className="text-[12px] text-danger text-center">{err}</div>}
    </div>
  );
}
