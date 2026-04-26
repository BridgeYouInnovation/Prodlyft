import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

async function owns(ticketId: string, userId: number, isAdmin: boolean): Promise<{ ok: boolean; ticket?: Record<string, unknown> }> {
  const r = await pool.query("SELECT * FROM tickets WHERE id = $1", [ticketId]);
  if (r.rowCount === 0) return { ok: false };
  const t = r.rows[0];
  if (!isAdmin && t.user_id !== userId) return { ok: false };
  return { ok: true, ticket: t };
}

/**
 * GET /api/tickets/[id] — fetch one ticket plus its full message thread.
 * Marks all admin messages as "seen" by stamping last_user_view_at.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const su = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  const userId = Number(su?.id);
  if (!su || !Number.isFinite(userId)) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const isAdmin = !!su.is_admin;

  const check = await owns(id, userId, isAdmin);
  if (!check.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await pool.query(
    `SELECT id, ticket_id, sender_user_id, sender_role, body, created_at
     FROM ticket_messages WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [id],
  );

  // Stamp the appropriate "last viewed" so unread counts collapse.
  if (isAdmin) {
    await pool.query("UPDATE tickets SET last_admin_view_at = NOW() WHERE id = $1", [id]);
  } else {
    await pool.query("UPDATE tickets SET last_user_view_at = NOW() WHERE id = $1", [id]);
  }

  return NextResponse.json({ ticket: check.ticket, messages: messages.rows });
}

/**
 * PATCH /api/tickets/[id] — change status. Users can close their own tickets;
 * only admins can re-open or change to other statuses.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const su = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  const userId = Number(su?.id);
  if (!su || !Number.isFinite(userId)) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const { id } = await params;
  const isAdmin = !!su.is_admin;

  const check = await owns(id, userId, isAdmin);
  if (!check.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = (body.status || "").trim().toLowerCase();
  const VALID = new Set(["open", "waiting_admin", "waiting_user", "closed"]);
  if (!VALID.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!isAdmin && status !== "closed") {
    return NextResponse.json({ error: "Only admins can set that status" }, { status: 403 });
  }
  await pool.query(
    "UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2",
    [status, id],
  );
  return NextResponse.json({ ok: true });
}
