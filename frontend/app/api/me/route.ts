import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findUserById, quotaRemaining } from "@/lib/db";
import { getBalance } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * GET /api/me — signed-in user's identity + live token balance.
 *
 * The session already carries plan/admin (static at login time) but the
 * token balance changes whenever a crawl saves a product or a blog post
 * publishes, so the client polls this for fresh numbers. The legacy
 * plan/usage fields are still returned so any old UI keeps working until
 * we tear them out.
 */
export async function GET() {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const u = await findUserById(userId);
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tokens = await getBalance(userId);

  return NextResponse.json({
    id: u.id,
    email: u.email,
    name: u.name,
    is_admin: u.is_admin,

    // Token economy (canonical going forward).
    tokens: {
      balance: tokens.balance,                 // -1 = unlimited (admin)
      total_purchased: tokens.total_purchased,
      total_consumed: tokens.total_consumed,
    },

    // Legacy plan fields — kept until the UI cutover lands.
    plan: u.plan || "free",
    plan_period_start: u.plan_period_start,
    products_used_in_period: u.products_used_in_period || 0,
    products_used_total: u.products_used_total || 0,
    remaining: quotaRemaining(u),
  });
}
