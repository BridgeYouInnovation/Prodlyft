import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail } from "@/lib/db";
import {
  RESEND_COOLDOWN_SECONDS,
  issueVerificationToken,
  lastTokenIssuedAt,
  sendVerificationEmail,
  verificationUrl,
} from "@/lib/verification";

export const runtime = "nodejs";

/**
 * POST /api/auth/verify/resend — re-send the verification email.
 *
 * Body: { email }
 *
 * - Always responds 200 with `{ ok: true }` even when the email isn't
 *   in our DB, to prevent an account-enumeration oracle.
 * - Enforces a 60-second cooldown per email to stop someone using us
 *   to spam an inbox with mail.
 * - Does NOT require the user to be signed in (they can't — they
 *   haven't verified yet).
 */
export async function POST(req: NextRequest) {
  let body: { email?: string } = {};
  try {
    body = (await req.json()) as { email?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const user = await findUserByEmail(email);
  if (!user) {
    // Pretend success — don't leak whether the address exists.
    return NextResponse.json({ ok: true, cooldown_seconds: 0 });
  }
  if (user.email_verified) {
    // Already verified; nothing to send. Tell the client so it can
    // route to /signin without showing "check your inbox" again.
    return NextResponse.json({ ok: true, already_verified: true });
  }

  // Rate-limit per address — anyone with the email can trigger a send,
  // so we have to throttle on the address itself, not on session.
  const lastIssued = await lastTokenIssuedAt(email);
  if (lastIssued) {
    const secondsAgo = (Date.now() - lastIssued.getTime()) / 1000;
    if (secondsAgo < RESEND_COOLDOWN_SECONDS) {
      const wait = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsAgo);
      return NextResponse.json(
        { ok: false, error: "Too many requests", cooldown_seconds: wait },
        { status: 429 },
      );
    }
  }

  const { token } = await issueVerificationToken(email);
  const origin = req.headers.get("origin") || "https://prodlyft.com";
  const url = verificationUrl(origin, token);
  const result = await sendVerificationEmail({ to: email, url, name: user.name });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Email failed" },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, cooldown_seconds: RESEND_COOLDOWN_SECONDS });
}
