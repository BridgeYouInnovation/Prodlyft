import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUser, pool } from "@/lib/db";
import { creditTokens, SIGNUP_BONUS } from "@/lib/tokens";
import { decideSignupBonus, pickClientIp } from "@/lib/abuse";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    // Record the signup IP and decide whether this account earns the
    // 10-token welcome bonus. Account creation always succeeds; the bonus
    // is what we gate on, so legit users with throwaway domains can still
    // sign in and just need to top up to start.
    const ip = pickClientIp(req);
    if (ip) {
      try {
        await pool.query(
          "UPDATE users SET signup_ip = $1 WHERE id = $2",
          [ip, user.id],
        );
      } catch (e) {
        console.warn("[signup] could not persist signup_ip:", e);
      }
    }

    const decision = await decideSignupBonus(emailNorm, ip);
    if (decision.grant) {
      try {
        await creditTokens(user.id, SIGNUP_BONUS, "signup_bonus", {
          ref_type: "user",
          ref_id: String(user.id),
          meta: { ip },
        });
        await pool.query(
          "UPDATE users SET signup_bonus_granted = TRUE WHERE id = $1",
          [user.id],
        );
      } catch (e) {
        console.error("[signup] bonus credit failed:", e);
      }
    } else {
      console.log("[signup] bonus declined", { email: emailNorm, ip, reason: decision.reason });
    }

    return NextResponse.json({ ok: true, bonus_granted: decision.grant });
  } catch (e) {
    console.error("[signup] DB error:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `DB error: ${msg.slice(0, 220)}` },
      { status: 500 },
    );
  }
}
