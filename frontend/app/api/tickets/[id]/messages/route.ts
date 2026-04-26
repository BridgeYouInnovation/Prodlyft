import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

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
  return NextResponse.json({ ok: true }, { status: 201 });
}
