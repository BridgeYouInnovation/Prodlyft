import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { checkStatus } from "@/lib/mcp";
import { creditTokens, getPack } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaymentRow {
  id: string;
  user_id: number;
  plan: string;          // legacy column, now stores pack_id
  amount: string;
  currency: string;
  status: string;
  app_transaction_ref: string;
  mcp_transaction_ref: string | null;
  payload: unknown;
  created_at: string;
  updated_at: string;
}

/**
 * GET /api/payment/[ref] — return the status of one of the caller's
 * payments. Used by /pricing/success to poll until MCP's callback lands
 * (usually ~seconds after the payer confirms on the MCP checkout).
 *
 * Reconciliation fallback: if the payment is still 'pending' on our side
 * for more than ~10 seconds, hit MCP's /checkStatus to see if the callback
 * was delivered to a different instance / dropped. If MCP says SUCCESS we
 * credit tokens here too — same idempotency guarantees as the webhook
 * (the unique partial index on token_ledger(reason='purchase', ref_id)
 * stops double-credit).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { ref } = await params;

  const r = await pool.query<PaymentRow>(
    `SELECT id, user_id, plan, amount, currency, status, app_transaction_ref,
            mcp_transaction_ref, payload, created_at, updated_at
     FROM payments WHERE app_transaction_ref = $1`,
    [ref],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = r.rows[0];
  if (p.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Reconcile when the row is stuck pending. Wait at least ~8 seconds since
  // the row was created so the normal callback path gets first crack — no
  // reason to hammer MCP for a payment that's about to confirm naturally.
  const ageMs = Date.now() - new Date(p.updated_at).getTime();
  if ((p.status === "pending" || p.status === "created") && p.mcp_transaction_ref && ageMs > 8_000) {
    try {
      const live = await checkStatus(p.mcp_transaction_ref);
      if (live.status === "success") {
        const mcpStatus = (live.transaction_status || "").toUpperCase();
        const internalStatus =
          mcpStatus === "SUCCESS"  ? "success"  :
          mcpStatus === "CANCELED" ? "canceled" :
          mcpStatus === "FAILED"   ? "failed"   :
          mcpStatus === "PENDING"  ? "pending"  : "created";

        if (internalStatus !== p.status) {
          await pool.query(
            `UPDATE payments
                SET status = $1,
                    payload = COALESCE(payload, $2),
                    updated_at = NOW()
              WHERE app_transaction_ref = $3`,
            [
              internalStatus,
              JSON.stringify({ ...live, _via: "checkStatus_reconcile" }),
              p.app_transaction_ref,
            ],
          );
          p.status = internalStatus;

          // Credit tokens if MCP says SUCCESS and we haven't already.
          // creditTokens is idempotent on (reason='purchase', ref_id) so
          // even if the webhook arrives a second later we're safe.
          if (internalStatus === "success") {
            const pack = await getPack(p.plan);
            if (pack && Number(live.transaction_amount) === pack.price_xaf) {
              await creditTokens(p.user_id, pack.tokens, "purchase", {
                ref_type: "payment",
                ref_id: p.app_transaction_ref,
                meta: {
                  pack_id: pack.id,
                  pack_name: pack.name,
                  xaf: pack.price_xaf,
                  mcp_ref: live.transaction_ref,
                  operator: live.transaction_operator,
                  via: "checkStatus_reconcile",
                },
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn("[payment.poll] checkStatus reconcile failed:", e);
    }
  }

  // Pull the operator out of whichever payload we have (callback or live
  // checkStatus result) so the success page can show "paid via MTN MoMo".
  let operator: string | null = null;
  if (p.payload && typeof p.payload === "object") {
    operator = (p.payload as { transaction_operator?: string }).transaction_operator || null;
  }

  return NextResponse.json({
    id: p.id,
    user_id: p.user_id,
    plan: p.plan,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    app_transaction_ref: p.app_transaction_ref,
    mcp_transaction_ref: p.mcp_transaction_ref,
    operator,
    created_at: p.created_at,
    updated_at: p.updated_at,
  });
}
