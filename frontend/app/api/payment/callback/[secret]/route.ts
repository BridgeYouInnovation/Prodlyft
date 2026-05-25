import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { mapStatus, verifyWebhookSecret, type FapshiStatus } from "@/lib/fapshi";
import { creditTokens, getPack } from "@/lib/tokens";

export const runtime = "nodejs";

interface FapshiWebhookBody {
  transId?: string;
  status?: FapshiStatus | string;
  medium?: string;
  amount?: number;
  externalId?: string;     // our app_transaction_ref
  userId?: string;
  email?: string;
  payerName?: string;
  reason?: string;
  financialTransId?: string;
  dateInitiated?: string;
  dateConfirmed?: string;
}

/**
 * POST /api/payment/callback/[secret] — Fapshi webhook receiver.
 *
 * Three layers of security in order:
 *   1. The URL path carries an unguessable secret. Mismatches return 404
 *      to avoid leaking that the path is a webhook receiver at all.
 *   2. The `x-wh-secret` header on the request must match the secret
 *      we configured in our Fapshi dashboard (FAPSHI_WEBHOOK_SECRET).
 *      Constant-time compare. This is the *primary* authenticity check.
 *   3. The webhook's `externalId` must match a payment row we created.
 *
 * Fapshi expects HTTP 200 for any accepted webhook (success or no-op).
 * Returning 4xx/5xx is fine but Fapshi may flag the integration as
 * unhealthy. Idempotency is on us — see the `status !== "success"`
 * guard below; the token_ledger unique partial index is the safety net.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const expectedPathSecret = process.env.MCP_CALLBACK_SECRET; // env name kept for back-compat
  if (!expectedPathSecret || secret !== expectedPathSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Primary auth: x-wh-secret header (per Fapshi docs).
  const wh = req.headers.get("x-wh-secret");
  if (!verifyWebhookSecret(wh)) {
    console.error("[fapshi.callback] x-wh-secret mismatch");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let payload: FapshiWebhookBody;
  try {
    payload = (await req.json()) as FapshiWebhookBody;
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const externalId = (payload.externalId || "").trim();
  const transId = (payload.transId || "").trim();
  if (!externalId) {
    console.error("[fapshi.callback] webhook missing externalId", payload);
    return new NextResponse("Missing externalId", { status: 400 });
  }

  const internalStatus = mapStatus(payload.status);

  const existing = await pool.query<{
    user_id: number; plan: string; status: string; amount: string;
  }>(
    `SELECT user_id, plan, status, amount
       FROM payments
      WHERE app_transaction_ref = $1`,
    [externalId],
  );
  if (existing.rowCount === 0) {
    console.error("[fapshi.callback] unknown externalId", externalId);
    return new NextResponse("Unknown payment", { status: 404 });
  }
  const row = existing.rows[0];

  await pool.query(
    `UPDATE payments
        SET status = $1,
            mcp_transaction_ref = COALESCE(mcp_transaction_ref, $2),
            payload = $3,
            updated_at = NOW()
      WHERE app_transaction_ref = $4`,
    [
      internalStatus,
      transId || null,
      JSON.stringify({ provider: "fapshi", ...payload }),
      externalId,
    ],
  );

  // Credit tokens on SUCCESSFUL only, and only if we haven't already.
  // creditTokens is idempotent on (reason='purchase', ref_id) via the
  // unique partial index — so even if Fapshi sends the webhook twice
  // or our checkStatus reconcile fires in parallel, no double-credit.
  if (internalStatus === "success" && row.status !== "success") {
    const pack = await getPack(row.plan);
    const paid = Number(payload.amount ?? 0);
    if (!pack) {
      console.error("[fapshi.callback] success for unknown pack", { pack_id: row.plan, externalId });
    } else if (paid !== pack.price_xaf) {
      // Defence-in-depth: webhook signature already proves authenticity,
      // but amount mismatch is still worth flagging as a config error.
      console.error("[fapshi.callback] amount mismatch — refusing to credit", {
        pack_id: pack.id, expected_xaf: pack.price_xaf, paid_xaf: paid, externalId,
      });
    } else {
      try {
        const newBalance = await creditTokens(row.user_id, pack.tokens, "purchase", {
          ref_type: "payment",
          ref_id: externalId,
          meta: {
            provider: "fapshi",
            pack_id: pack.id,
            pack_name: pack.name,
            xaf: pack.price_xaf,
            transId,
            medium: payload.medium,
            financialTransId: payload.financialTransId,
          },
        });
        console.log("[fapshi.callback] credited tokens", {
          user_id: row.user_id, pack_id: pack.id, tokens: pack.tokens,
          new_balance: newBalance, externalId,
        });
      } catch (e) {
        console.error("[fapshi.callback] credit failed", e);
      }
    }
  }

  return new NextResponse("OK", { status: 200 });
}
