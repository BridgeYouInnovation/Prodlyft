import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { checkPaymentStatus, mapStatus } from "@/lib/fapshi";
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
  // No auth gate here — the app_transaction_ref is itself an unguessable
  // 24-hex-char (96-bit) sha256-derived token, so possessing it is the
  // credential. Returning only non-PII fields below (status, operator,
  // pack id, timestamps) means even if the ref leaked we wouldn't expose
  // anything sensitive. Earlier the auth-gated version dropped polling
  // on any 401 — for users whose session cookie didn't survive the
  // round-trip via MCP, the success page got permanently stuck on
  // "Confirming…" even though the payment had landed and tokens had
  // been credited.
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);

  const { ref } = await params;

  const r = await pool.query<PaymentRow>(
    `SELECT id, user_id, plan, amount, currency, status, app_transaction_ref,
            mcp_transaction_ref, payload, created_at, updated_at
     FROM payments WHERE app_transaction_ref = $1`,
    [ref],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = r.rows[0];
  // Track whether the caller is the payment owner. Only matters for
  // the optional ownership flag we send back so the client can show
  // "your payment" vs generic copy. Mismatch is NOT an error here.
  const isOwner = Number.isFinite(userId) && p.user_id === userId;

  // Reconcile when the row is stuck pending. Wait at least ~8 seconds
  // since the row was last touched so the normal webhook path gets
  // first crack — and so we stay well under Fapshi's 6 req/min/transId
  // rate limit on /payment-status.
  const ageMs = Date.now() - new Date(p.updated_at).getTime();
  if ((p.status === "pending" || p.status === "created") && p.mcp_transaction_ref && ageMs > 8_000) {
    try {
      const live = await checkPaymentStatus(p.mcp_transaction_ref);
      if (live.ok) {
        const internalStatus = mapStatus(live.status);
        if (internalStatus !== p.status) {
          await pool.query(
            `UPDATE payments
                SET status = $1,
                    payload = COALESCE(payload, $2),
                    updated_at = NOW()
              WHERE app_transaction_ref = $3`,
            [
              internalStatus,
              JSON.stringify({ provider: "fapshi", _via: "checkStatus_reconcile", ...live }),
              p.app_transaction_ref,
            ],
          );
          p.status = internalStatus;

          // Credit tokens if Fapshi says SUCCESSFUL and we haven't
          // already. The unique partial index on
          // token_ledger(reason='purchase', ref_id) makes this
          // idempotent — webhook + reconcile racing is safe.
          if (internalStatus === "success") {
            const pack = await getPack(p.plan);
            if (pack && Number(live.amount ?? 0) === pack.price_xaf) {
              await creditTokens(p.user_id, pack.tokens, "purchase", {
                ref_type: "payment",
                ref_id: p.app_transaction_ref,
                meta: {
                  provider: "fapshi",
                  pack_id: pack.id,
                  pack_name: pack.name,
                  xaf: pack.price_xaf,
                  transId: live.transId,
                  medium: live.medium,
                  via: "checkStatus_reconcile",
                },
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn("[payment.poll] checkPaymentStatus reconcile failed:", e);
    }
  }

  // Pull the medium (MTN MoMo / Orange Money / etc.) out of whichever
  // payload we have so the success page can show "paid via MTN MoMo".
  let operator: string | null = null;
  if (p.payload && typeof p.payload === "object") {
    const pp = p.payload as { medium?: string; transaction_operator?: string };
    // Newer payloads from the Fapshi integration use `medium`; older
    // rows from the My-CoolPay era used `transaction_operator`.
    operator = pp.medium || pp.transaction_operator || null;
  }

  // Response shape — owner gets the full row, non-owners get only what
  // the success page needs to show "paid via X, redirect to dashboard".
  // Everyone gets status + operator + plan because the ref-holder
  // already knows those (they passed plan to /paylink and saw the
  // operator on MCP's checkout).
  if (isOwner) {
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
      is_owner: true,
      created_at: p.created_at,
      updated_at: p.updated_at,
    });
  }
  return NextResponse.json({
    status: p.status,
    plan: p.plan,
    operator,
    is_owner: false,
  });
}
