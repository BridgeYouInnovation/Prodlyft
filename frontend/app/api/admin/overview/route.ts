import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

export async function GET() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const [users, admins, crawls, products, statuses] = await Promise.all([
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM users"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM users WHERE is_admin = TRUE"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM crawls"),
    pool.query<{ n: string }>("SELECT COUNT(*) AS n FROM products"),
    pool.query<{ status: string; n: string }>("SELECT status, COUNT(*) AS n FROM crawls GROUP BY status"),
  ]);

  const map = { pending: 0, processing: 0, done: 0, failed: 0 };
  for (const r of statuses.rows) {
    if (r.status in map) (map as Record<string, number>)[r.status] = Number(r.n);
  }

  return NextResponse.json({
    users: Number(users.rows[0].n),
    admins: Number(admins.rows[0].n),
    crawls: Number(crawls.rows[0].n),
    products: Number(products.rows[0].n),
    statuses: map,
  });
}
