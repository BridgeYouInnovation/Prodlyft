import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, findUserById } from "@/lib/db";
import { createPaylink, newAppTransactionRef } from "@/lib/mcp";
import { getPack } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * POST /api/payment/paylink — create a My-CoolPay payment link for the
 * authenticated user buying a token pack. Returns the hosted checkout URL;
 * the client redirects the browser there. The webhook
 * (/api/payment/callback/[secret]) credits the tokens once MCP confirms.
 *
 * Body: { pack_id: "starter" | "creator" | "business" | "scale" }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { pack_id?: string } = {};
  try {
    body = (await req.json()) as { pack_id?: string };
  } catch { /* allow empty body */ }

  const packId = (body.pack_id || "").toLowerCase().trim();
  if (!packId) {
    return NextResponse.json({ error: "pack_id is required" }, { status: 400 });
  }

  const pack = await getPack(packId);
  if (!pack) {
    return NextResponse.json({ error: "Unknown or disabled pack" }, { status: 400 });
  }

  const user = await findUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const appRef = newAppTransactionRef();

  // Persist intent before hitting MCP. We store the pack id in the legacy
  // `plan` column for now — same shape, different meaning.
  await pool.query(
    `INSERT INTO payments (id, user_id, plan, amount, currency, app_transaction_ref, status)
     VALUES ($1, $2, $3, $4, 'XAF', $5, 'created')`,
    [appRef, userId, packId, pack.price_xaf, appRef],
  );

  const result = await createPaylink({
    transaction_amount: pack.price_xaf,
    transaction_currency: "XAF",
    transaction_reason: `Prodlyft — ${pack.name} (${pack.tokens.toLocaleString()} tokens)`,
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
    pack: { id: pack.id, name: pack.name, tokens: pack.tokens },
  });
}
