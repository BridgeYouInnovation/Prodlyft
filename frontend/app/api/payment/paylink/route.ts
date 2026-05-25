import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool, findUserById } from "@/lib/db";
import { initiatePay, newExternalId } from "@/lib/fapshi";
import { getPack } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * POST /api/payment/paylink — create a Fapshi payment link for the
 * authenticated user buying a token pack. Returns the hosted checkout
 * URL; the client redirects the browser there. The webhook
 * (/api/payment/callback/[secret]) credits the tokens once Fapshi
 * confirms.
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

  // externalId in Fapshi == our app_transaction_ref. Keep the column
  // name we already have in the `payments` table to avoid a migration.
  const externalId = newExternalId();

  // Persist intent before hitting Fapshi. We store the pack id in the
  // legacy `plan` column (same shape, different meaning since the
  // token-pack switch). If the Fapshi call fails we still have a
  // record we can investigate from the admin side.
  await pool.query(
    `INSERT INTO payments (id, user_id, plan, amount, currency, app_transaction_ref, status)
     VALUES ($1, $2, $3, $4, 'XAF', $5, 'created')`,
    [externalId, userId, packId, pack.price_xaf, externalId],
  );

  // Build the redirectUrl from the request origin so dev / preview
  // builds work without needing per-env config.
  const origin = req.headers.get("origin") || `https://${req.headers.get("host") || "prodlyft.com"}`;
  const redirectUrl = `${origin}/pricing/success?app_ref=${encodeURIComponent(externalId)}`;

  const result = await initiatePay({
    amount: pack.price_xaf,
    email: user.email,
    redirectUrl,
    userId: String(userId),
    externalId,
    message: `Prodlyft — ${pack.name} (${pack.tokens.toLocaleString()} tokens)`,
  });

  if (!result.ok) {
    await pool.query(
      `UPDATE payments SET status = 'failed', payload = $1, updated_at = NOW()
       WHERE app_transaction_ref = $2`,
      [JSON.stringify({ provider: "fapshi", status: result.status, message: result.message }), externalId],
    );
    return NextResponse.json(
      { error: result.message || "Payment provider rejected the request" },
      { status: 502 },
    );
  }

  // Store Fapshi's transId in the existing mcp_transaction_ref column.
  // The column name is now a misnomer but renaming requires a schema
  // migration; the value semantics are identical (their internal ref
  // that we use for status lookups).
  await pool.query(
    `UPDATE payments
        SET mcp_transaction_ref = $1, status = 'pending', updated_at = NOW()
      WHERE app_transaction_ref = $2`,
    [result.transId, externalId],
  );

  return NextResponse.json({
    payment_url: result.link,
    transaction_ref: result.transId,
    app_transaction_ref: externalId,
    pack: { id: pack.id, name: pack.name, tokens: pack.tokens },
  });
}
