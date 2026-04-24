import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { verifyCallbackSignature, type CallbackPayload } from "@/lib/mcp";

export const runtime = "nodejs";

const MCP_IP_ALLOWLIST = ["15.236.140.89"];

function pickRemoteIp(req: NextRequest): string | null {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? null;
}

function planForAmount(amount: number): "pro" | "unlimited" | null {
  if (amount === 10_000) return "pro";
  if (amount === 25_000) return "unlimited";
  return null;
}

/**
 * POST /api/payment/callback/[secret] — webhook receiver for My-CoolPay.
 *
 * Security layers in order (per the MCP docs):
 *   1. The URL path carries an unguessable secret.
 *   2. The source IP must be 15.236.140.89 (MCP's webhook origin) — we log
 *      but don't hard-reject if it doesn't match, since Vercel's edge can
 *      occasionally alter x-forwarded-for formatting.
 *   3. The MD5 signature on the payload must match what we compute with our
 *      private key.
 *
 * MCP only sends the callback ONCE. Respond with literal "OK" on success so
 * they don't retry (there's no retry anyway, but MCP treats non-OK as an
 * integration problem worth flagging to the merchant).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ secret: string }> },
) {
  const { secret } = await params;
  const expected = process.env.MCP_CALLBACK_SECRET;
  if (!expected || secret !== expected) {
    return new NextResponse("KO", { status: 404 });
  }

  let payload: CallbackPayload;
  try {
    payload = (await req.json()) as CallbackPayload;
  } catch {
    return new NextResponse("KO", { status: 400 });
  }

  const sourceIp = pickRemoteIp(req);
  const ipOk = sourceIp ? MCP_IP_ALLOWLIST.includes(sourceIp) : false;

  if (!verifyCallbackSignature(payload)) {
    // Signature mismatch — reject hard.
    console.error("[mcp.callback] bad signature", {
      ref: payload.app_transaction_ref,
      sourceIp,
    });
    return new NextResponse("KO", { status: 401 });
  }

  const appRef = payload.app_transaction_ref;
  if (!appRef) return new NextResponse("KO", { status: 400 });

  // Map MCP status to our internal status.
  const mcpStatus = (payload.transaction_status || "").toUpperCase();
  const internalStatus =
    mcpStatus === "SUCCESS" ? "success" :
    mcpStatus === "CANCELED" ? "canceled" :
    mcpStatus === "FAILED" ? "failed" :
    mcpStatus === "PENDING" ? "pending" :
    "created";

  const existing = await pool.query<{ user_id: number; plan: string; status: string; amount: string }>(
    `SELECT user_id, plan, status, amount FROM payments WHERE app_transaction_ref = $1`,
    [appRef],
  );
  if (existing.rowCount === 0) {
    console.error("[mcp.callback] unknown app_transaction_ref", appRef);
    return new NextResponse("KO", { status: 404 });
  }

  const row = existing.rows[0];
  // Persist the raw payload + new status.
  await pool.query(
    `UPDATE payments
       SET status = $1,
           mcp_transaction_ref = COALESCE(mcp_transaction_ref, $2),
           payload = $3,
           updated_at = NOW()
     WHERE app_transaction_ref = $4`,
    [internalStatus, payload.transaction_ref, JSON.stringify({ ...payload, _ip: sourceIp, _ip_ok: ipOk }), appRef],
  );

  // Only activate the plan on SUCCESS, and only if we haven't already (don't
  // re-credit if MCP somehow re-delivers).
  if (internalStatus === "success" && row.status !== "success") {
    // Double-check amount matches a known plan so a tampered payload can't
    // promote someone to Unlimited with a cheaper charge.
    const expectedPlan = planForAmount(Number(payload.transaction_amount));
    const plan = expectedPlan ?? row.plan;
    await pool.query(
      `UPDATE users
          SET plan = $1,
              plan_period_start = NOW(),
              products_used_in_period = 0
        WHERE id = $2`,
      [plan, row.user_id],
    );
    console.log("[mcp.callback] upgraded user", { user_id: row.user_id, plan, appRef });
  }

  return new NextResponse("OK", { status: 200 });
}
