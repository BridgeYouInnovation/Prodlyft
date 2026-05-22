import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, pool } from "@/lib/db";
import { creditTokens, SIGNUP_BONUS } from "@/lib/tokens";
import { decideSignupBonus } from "@/lib/abuse";
import { consumeVerificationToken } from "@/lib/verification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/verify?token=<hex> — clicked from the verification
 * email. Consumes the single-use token, marks the user verified,
 * grants the 10-token signup bonus if they're still eligible, then
 * redirects to /signin?verified=1.
 *
 * Failure modes always redirect (the user is in their email client,
 * an in-page error blob would be confusing) and surface the reason via
 * a query string the /signin page reads.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const origin = url.origin;

  if (!token) {
    return NextResponse.redirect(`${origin}/signin?verified=0&reason=missing`);
  }

  const email = await consumeVerificationToken(token);
  if (!email) {
    // Either unknown token, already consumed, or expired.
    return NextResponse.redirect(`${origin}/signin?verified=0&reason=expired`);
  }

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.redirect(`${origin}/signin?verified=0&reason=no_user`);
  }

  // Mark verified. Idempotent — clicking the link a second time after
  // the token's been consumed lands on the reason=expired branch above,
  // but we still set the column here in case it was somehow cleared.
  await pool.query(
    `UPDATE users SET "emailVerified" = COALESCE("emailVerified", NOW()) WHERE id = $1`,
    [user.id],
  );

  // Grant the signup bonus NOW that the email is verified. Re-evaluate
  // eligibility against the current state (the IP cooldown might tick
  // over if the user took their time to click). creditTokens is
  // idempotent on (reason='signup_bonus', ref_id) so a replay won't
  // double-credit.
  const ipRow = await pool.query<{ signup_ip: string | null; signup_bonus_granted: boolean }>(
    "SELECT signup_ip, signup_bonus_granted FROM users WHERE id = $1",
    [user.id],
  );
  const signupIp = ipRow.rows[0]?.signup_ip ?? null;
  const alreadyGranted = ipRow.rows[0]?.signup_bonus_granted ?? false;

  if (!alreadyGranted) {
    const decision = await decideSignupBonus(email, signupIp);
    if (decision.grant) {
      try {
        await creditTokens(user.id, SIGNUP_BONUS, "signup_bonus", {
          ref_type: "user",
          ref_id: String(user.id),
          meta: { ip: signupIp, via: "verify_email" },
        });
        await pool.query(
          "UPDATE users SET signup_bonus_granted = TRUE WHERE id = $1",
          [user.id],
        );
      } catch (e) {
        // Non-fatal — the user can still log in. The bonus failure is
        // logged for the operator to investigate.
        console.error("[verify] bonus credit failed:", e);
      }
    } else {
      console.log("[verify] bonus declined post-verify", {
        email, ip: signupIp, reason: decision.reason,
      });
    }
  }

  return NextResponse.redirect(`${origin}/signin?verified=1&email=${encodeURIComponent(email)}`);
}
