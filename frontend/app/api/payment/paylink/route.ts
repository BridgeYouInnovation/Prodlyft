import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, findUserById } from "@/lib/db";
import { createPaylink, MCP_XAF_PRICES, newAppTransactionRef } from "@/lib/mcp";

export const runtime = "nodejs";

/**
 * POST /api/payment/paylink — create a My-CoolPay payment link for the
 * authenticated user upgrading to Pro or Unlimited. Returns the hosted
 * checkout URL; the client redirects the browser there.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { plan?: string } = {};
  try {
    body = (await req.json()) as { plan?: string };
  } catch { /* allow empty body */ }

  const plan = (body.plan || "").toLowerCase();
  if (plan !== "pro" && plan !== "unlimited") {
    return NextResponse.json({ error: "plan must be 'pro' or 'unlimited'" }, { status: 400 });
  }

  const amount = MCP_XAF_PRICES[plan];
  if (!amount) {
    return NextResponse.json({ error: "Price not configured for that plan" }, { status: 400 });
  }

  const user = await findUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const appRef = newAppTransactionRef();

  // Store the intent before hitting MCP — if MCP fails we still have a
  // record we can investigate from the admin side.
  await pool.query(
    `INSERT INTO payments (id, user_id, plan, amount, currency, app_transaction_ref, status)
     VALUES ($1, $2, $3, $4, 'XAF', $5, 'created')`,
    [appRef, userId, plan, amount, appRef],
  );

  const result = await createPaylink({
    transaction_amount: amount,
    transaction_currency: "XAF",
    transaction_reason: `Prodlyft ${plan === "pro" ? "Pro" : "Unlimited"} — monthly`,
    app_transaction_ref: appRef,
    customer_email: user.email,
    customer_name: user.name || undefined,
    customer_lang: "en",
  });

  if (result.status !== "success") {
    await pool.query(
      `UPDATE payments SET status = 'failed', payload = $1, updated_at = NOW()
       WHERE app_transaction_ref = $2`,
      [JSON.stringify(result), appRef],
    );
    return NextResponse.json(
      { error: (result as { message?: string }).message || "Payment provider rejected the request" },
      { status: 502 },
    );
  }

  await pool.query(
    `UPDATE payments SET mcp_transaction_ref = $1, status = 'pending', updated_at = NOW()
     WHERE app_transaction_ref = $2`,
    [result.transaction_ref, appRef],
  );

  return NextResponse.json({
    payment_url: result.payment_url,
    transaction_ref: result.transaction_ref,
    app_transaction_ref: appRef,
  });
}
