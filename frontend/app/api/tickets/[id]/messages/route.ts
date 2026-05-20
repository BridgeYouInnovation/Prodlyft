import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { escapeHtml, sendEmail, supportEmail } from "@/lib/email";

export const runtime = "nodejs";

function newId(): string {
  const buf = crypto.getRandomValues(new Uint8Array(9));
  return "msg_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * POST /api/tickets/[id]/messages — add a message to a ticket. Sender role is
 * derived from the session (admin vs user), and the ticket's status is
 * flipped so the *other* side sees it as awaiting them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const su = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  const userId = Number(su?.id);
  if (!su || !Number.isFinite(userId)) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const isAdmin = !!su.is_admin;

  const t = await pool.query<{ user_id: number; status: string }>(
    "SELECT user_id, status FROM tickets WHERE id = $1",
    [id],
  );
  if (t.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin && t.rows[0].user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body.body || "").trim();
  if (!text) return NextResponse.json({ error: "Message required" }, { status: 400 });

  const newStatus = isAdmin ? "waiting_user" : "waiting_admin";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ticket_messages (id, ticket_id, sender_user_id, sender_role, body)
       VALUES ($1, $2, $3, $4, $5)`,
      [newId(), id, userId, isAdmin ? "admin" : "user", text],
    );
    await client.query(
      `UPDATE tickets SET status = $1, updated_at = NOW(),
                          ${isAdmin ? "last_admin_view_at" : "last_user_view_at"} = NOW()
       WHERE id = $2`,
      [newStatus, id],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }
  // Notify the OTHER side via email. User reply → admin inbox; admin
  // reply → user's account email. Both are best-effort.
  try {
    const inbox = supportEmail();
    if (!isAdmin && inbox) {
      // User reply → ping admin. session.user.email is the canonical
      // source (NextAuth attaches it whenever it's known).
      const userEmail = (session?.user?.email || "").trim();
      const origin = req.headers.get("origin") || "https://prodlyft.com";
      const url = `${origin}/admin/tickets/${id}`;
      void sendEmail({
        to: inbox,
        subject: `[Prodlyft ticket] new reply from ${userEmail || "user"}`,
        replyTo: userEmail || undefined,
        text:
          `New reply on ticket ${id}\n\n` +
          `From: ${userEmail || "user #" + userId}\n\n` +
          `${text}\n\n` +
          `Open: ${url}\n`,
        html:
          `<div style="font-family:system-ui,sans-serif;line-height:1.5">` +
          `<p><strong>New ticket reply</strong> from ` +
          `${userEmail ? `<a href="mailto:${escapeHtml(userEmail)}">${escapeHtml(userEmail)}</a>` : `user #${userId}`}</p>` +
          `<blockquote style="border-left:3px solid #ddd;padding-left:12px;white-space:pre-wrap;margin:12px 0">${escapeHtml(text)}</blockquote>` +
          `<p><a href="${escapeHtml(url)}">Open ticket</a></p>` +
          `</div>`,
      });
    } else if (isAdmin) {
      // Admin reply → ping the user. Look up their email.
      const ur = await pool.query<{ email: string | null }>(
        "SELECT email FROM users WHERE id = $1",
        [t.rows[0].user_id],
      );
      const userEmail = ur.rows[0]?.email;
      if (userEmail) {
        const origin = req.headers.get("origin") || "https://prodlyft.com";
        const url = `${origin}/tickets/${id}`;
        void sendEmail({
          to: userEmail,
          subject: "Prodlyft support — new reply on your ticket",
          text:
            `We replied to your support ticket.\n\n` +
            `${text}\n\n` +
            `View thread: ${url}\n`,
          html:
            `<div style="font-family:system-ui,sans-serif;line-height:1.5">` +
            `<p>We replied to your support ticket.</p>` +
            `<blockquote style="border-left:3px solid #ddd;padding-left:12px;white-space:pre-wrap;margin:12px 0">${escapeHtml(text)}</blockquote>` +
            `<p><a href="${escapeHtml(url)}">View the full thread on Prodlyft</a></p>` +
            `</div>`,
        });
      }
    }
  } catch (e) {
    console.warn("[tickets.message] email notification failed:", (e as Error).message);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
