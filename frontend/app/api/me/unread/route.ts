import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/me/unread — counters for the badge in the sidebar.
 * - For users: how many tickets have admin replies they haven't seen.
 * - For admins: how many tickets are awaiting an admin response.
 */
export async function GET() {
  const session = await auth();
  const su = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  const userId = Number(su?.id);
  if (!su || !Number.isFinite(userId)) {
    return NextResponse.json({ user_unread: 0, admin_unread: 0 });
  }

  const userR = await pool.query<{ n: string }>(
    `SELECT COUNT(DISTINCT t.id) AS n
     FROM tickets t
     JOIN ticket_messages m ON m.ticket_id = t.id
     WHERE t.user_id = $1
       AND m.sender_role = 'admin'
       AND (t.last_user_view_at IS NULL OR m.created_at > t.last_user_view_at)`,
    [userId],
  );
  const userUnread = Number(userR.rows[0].n) || 0;

  let adminUnread = 0;
  if (su.is_admin) {
    const adminR = await pool.query<{ n: string }>(
      `SELECT COUNT(DISTINCT t.id) AS n
       FROM tickets t
       JOIN ticket_messages m ON m.ticket_id = t.id
       WHERE m.sender_role = 'user'
         AND (t.last_admin_view_at IS NULL OR m.created_at > t.last_admin_view_at)`,
    );
    adminUnread = Number(adminR.rows[0].n) || 0;
  }

  return NextResponse.json({ user_unread: userUnread, admin_unread: adminUnread });
}
