import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sendEmail, supportEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/admin/email/test — admin-only SMTP smoke test.
 *
 * Sends a tiny "Prodlyft SMTP test" email to SUPPORT_EMAIL and returns
 * the result with full error detail. Use this when the help widget's
 * email notifications aren't arriving — the response tells you exactly
 * which env var is missing or which SMTP server is rejecting our login.
 *
 * Safe to call repeatedly; doesn't write anything to the DB.
 */
export async function POST() {
  const check = await requireAdmin();
  if (!check.ok) return check.res;

  const env = {
    SMTP_HOST: process.env.SMTP_HOST || "(default: smtp.gmail.com)",
    SMTP_PORT: process.env.SMTP_PORT || "(default: 465)",
    SMTP_USER: process.env.SMTP_USER ? `set (${process.env.SMTP_USER})` : "MISSING",
    SMTP_PASS: process.env.SMTP_PASS
      ? `set (${process.env.SMTP_PASS.length} chars)`
      : "MISSING",
    SMTP_FROM: process.env.SMTP_FROM || `(falls back to SMTP_USER)`,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || "(falls back to SMTP_USER)",
  };

  const target = supportEmail();
  if (!target) {
    return NextResponse.json(
      {
        ok: false,
        error: "No destination — SUPPORT_EMAIL and SMTP_USER are both unset",
        env,
      },
      { status: 500 },
    );
  }

  const stamp = new Date().toISOString();
  const result = await sendEmail({
    to: target,
    subject: `Prodlyft SMTP test · ${stamp}`,
    text:
      "This is a self-test sent from /api/admin/email/test.\n\n" +
      `If you can read this, ticket notifications will work too.\n\n` +
      `Timestamp: ${stamp}\n`,
    html:
      `<div style="font-family:system-ui,sans-serif;line-height:1.5">` +
      `<p><strong>Prodlyft SMTP test</strong></p>` +
      `<p>If you can read this, ticket notifications will work too.</p>` +
      `<p style="color:#888;font-size:12px">Timestamp: ${stamp}</p>` +
      `</div>`,
  });

  return NextResponse.json({
    ...result,
    target,
    env,
  });
}
