import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { creditTokens, getBalance, listLedger } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[id]/tokens — current balance + last 50 ledger rows.
 * POST /api/admin/users/[id]/tokens — grant or refund tokens.
 *
 * Body: { amount: number, reason?: "admin_grant" | "refund", note?: string }
 *
 * Admin-only — bypasses the unique idempotency index because each grant
 * gets a fresh per-call ref_id (uses Date.now()), so admins can stack
 * multiple grants without colliding.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const balance = await getBalance(userId);
  const ledger = await listLedger(userId, 50);
  return NextResponse.json({ balance, ledger });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    amount?: number; reason?: string; note?: string;
  };
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be a positive integer" }, { status: 400 });
  }
  const reason = body.reason === "refund" ? "refund" : "admin_grant";

  // Per-grant ref_id keeps repeat grants from clashing on the partial unique
  // index (which only covers purchase / signup_bonus / migration anyway).
  const refId = `${reason}_${Date.now()}_${check.userId}`;

  const newBalance = await creditTokens(userId, amount, reason, {
    ref_type: "admin",
    ref_id: refId,
    meta: { admin_id: check.userId, note: body.note || null },
  });

  return NextResponse.json({ ok: true, balance: newBalance });
}
