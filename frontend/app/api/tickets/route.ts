import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

function newId(prefix: string): string {
  const buf = crypto.getRandomValues(new Uint8Array(9));
  return prefix + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * GET /api/tickets — list the signed-in user's tickets, newest first.
 * Includes message_count and unread_for_user (admin replies after the
 * user's last view).
 */
export async function GET() {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const r = await pool.query(
    `SELECT t.id, t.user_id, t.subject, t.status, t.related_crawl_id,
            t.last_user_view_at, t.last_admin_view_at,
            t.created_at, t.updated_at,
            (SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
            (SELECT COUNT(*)::int FROM ticket_messages m
              WHERE m.ticket_id = t.id
                AND m.sender_role = 'admin'
                AND (t.last_user_view_at IS NULL OR m.created_at > t.last_user_view_at)
            ) AS unread_for_user
     FROM tickets t
     WHERE t.user_id = $1
     ORDER BY t.updated_at DESC`,
    [userId],
  );
  return NextResponse.json(r.rows);
}

/**
 * POST /api/tickets — open a new ticket. Body: { subject, body, related_crawl_id? }.
 * The first message is created in the same transaction so a ticket is never
 * empty.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { subject?: string; body?: string; related_crawl_id?: string | null } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const subject = (body.subject || "").trim().slice(0, 255);
  const text = (body.body || "").trim();
  if (!subject) return NextResponse.json({ error: "Subject required" }, { status: 400 });
  if (!text)    return NextResponse.json({ error: "Message required" }, { status: 400 });

  const ticketId = newId("tk_");
  const messageId = newId("msg_");
  const relatedCrawl = body.related_crawl_id?.trim() || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO tickets (id, user_id, subject, status, related_crawl_id,
                            last_user_view_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'waiting_admin', $4, NOW(), NOW(), NOW())`,
      [ticketId, userId, subject, relatedCrawl],
    );
    await client.query(
      `INSERT INTO ticket_messages (id, ticket_id, sender_user_id, sender_role, body)
       VALUES ($1, $2, $3, 'user', $4)`,
      [messageId, ticketId, userId, text],
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    client.release();
  }

  return NextResponse.json({ id: ticketId }, { status: 201 });
}
