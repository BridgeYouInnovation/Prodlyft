import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { findUserById, quotaRemaining } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/me — returns the signed-in user's plan + live usage counters.
 * The session already has plan (static at login time) but usage changes as
 * crawls complete, so the client polls this when it needs fresh numbers.
 */
export async function GET() {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const u = await findUserById(userId);
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: u.id,
    email: u.email,
    name: u.name,
    is_admin: u.is_admin,
    plan: u.plan || "free",
    plan_period_start: u.plan_period_start,
    products_used_in_period: u.products_used_in_period || 0,
    products_used_total: u.products_used_total || 0,
    remaining: quotaRemaining(u), // null = unlimited
  });
}
