import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser, pool } from "@/lib/db";
import { decideSignupBonus, pickClientIp } from "@/lib/abuse";
import {
  issueVerificationToken,
  sendVerificationEmail,
  verificationUrl,
} from "@/lib/verification";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/signup — create account + send verification email.
 *
 * Verification flow:
 *   1. Create row with email_verified=NULL.
 *   2. Generate single-use 32-byte token, store in verification_token.
 *   3. Email a confirmation link that hits /api/auth/verify on click.
 *   4. The 10-token signup bonus is DEFERRED to verify-time so disposable-
 *      email / IP-farming bots can't claim tokens by signing up alone.
 *
 * Account creation still succeeds even if the email send fails — the
 * user can request a resend from the post-signup screen.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { email, password, name } = (body ?? {}) as {
    email?: string;
    password?: string;
    name?: string;
  };

  const emailNorm = String(email ?? "").trim().toLowerCase();
  const pw = String(password ?? "");

  if (!EMAIL_RE.test(emailNorm)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (pw.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  try {
    const existing = await findUserByEmail(emailNorm);
    if (existing) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    const hash = await bcrypt.hash(pw, 10);
    const displayName = typeof name === "string" && name.trim() ? name.trim() : null;
    const user = await createUser(emailNorm, hash, displayName);

    // Record signup IP for the bonus-eligibility check we run at
    // verify-time. Account creation still succeeds if this fails.
    const ip = pickClientIp(req);
    if (ip) {
      try {
        await pool.query("UPDATE users SET signup_ip = $1 WHERE id = $2", [ip, user.id]);
      } catch (e) {
        console.warn("[signup] could not persist signup_ip:", e);
      }
    }

    // Record the bonus decision now so we don't have to re-resolve at
    // verify-time — but the actual credit only fires after the user
    // clicks the email link.
    const decision = await decideSignupBonus(emailNorm, ip);
    if (!decision.grant) {
      console.log("[signup] bonus declined", { email: emailNorm, ip, reason: decision.reason });
    }

    // Generate + send the verification token. Failure here doesn't roll
    // back the account — the user can hit "Resend" from the post-signup
    // screen.
    let email_sent = false;
    let email_error: string | undefined;
    try {
      const { token } = await issueVerificationToken(emailNorm);
      const origin = req.headers.get("origin") || "https://prodlyft.com";
      const url = verificationUrl(origin, token);
      const result = await sendVerificationEmail({
        to: emailNorm,
        url,
        name: displayName,
      });
      email_sent = result.ok;
      if (!result.ok) email_error = result.error;
    } catch (e) {
      email_error = (e as Error).message;
      console.error("[signup] verification email failed:", email_error);
    }

    return NextResponse.json({
      ok: true,
      // Tell the client an email's in flight so it can show
      // "check your inbox" — bonus is gated on click-through.
      verification_sent: email_sent,
      verification_error: email_sent ? undefined : email_error,
      // Tell the client whether the bonus will be granted IF they
      // verify — purely informational; the actual credit happens at
      // /api/auth/verify, which re-evaluates eligibility.
      bonus_eligible: decision.grant,
    });
  } catch (e) {
    console.error("[signup] DB error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `DB error: ${msg.slice(0, 220)}` },
      { status: 500 },
    );
  }
}
