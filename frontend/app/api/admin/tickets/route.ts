import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/**
 * GET /api/admin/tickets — every ticket, joined with the owner's email and
 * an unread-for-admin count (user messages newer than the admin's last view).
 */
export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const r = await pool.query(
    `SELECT t.id, t.user_id, u.email AS user_email,
            t.subject, t.status, t.related_crawl_id,
            t.last_user_view_at, t.last_admin_view_at,
            t.created_at, t.updated_at,
            (SELECT COUNT(*)::int FROM ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
            (SELECT COUNT(*)::int FROM ticket_messages m
              WHERE m.ticket_id = t.id
                AND m.sender_role = 'user'
                AND (t.last_admin_view_at IS NULL OR m.created_at > t.last_admin_view_at)
            ) AS unread_for_admin
     FROM tickets t
     LEFT JOIN users u ON u.id = t.user_id
     ORDER BY
       CASE t.status WHEN 'waiting_admin' THEN 0 WHEN 'open' THEN 1 ELSE 2 END,
       t.updated_at DESC`,
  );
  return NextResponse.json(r.rows);
}
