/**
 * Outbound email helper. Configurable via env vars so we can swap from
 * Gmail SMTP → Resend → SendGrid without code changes.
 *
 * Required env (set on Vercel):
 *   SMTP_HOST      → smtp.gmail.com (default), smtp.resend.com, etc.
 *   SMTP_PORT      → 465 (default — SSL) or 587 (STARTTLS)
 *   SMTP_USER      → the SMTP account username (full email for Gmail)
 *   SMTP_PASS      → app password for Gmail (NOT the account password —
 *                    Gmail blocks raw account passwords since 2022).
 *                    Generate at https://myaccount.google.com/apppasswords
 *   SMTP_FROM      → optional "From" header; defaults to SMTP_USER.
 *   SUPPORT_EMAIL  → where ticket notifications land; defaults to SMTP_USER.
 *
 * Everything is best-effort: send failures are logged but never block the
 * caller's primary operation (e.g. a ticket still gets created even if
 * the notification email fails).
 */
import nodemailer, { type Transporter } from "nodemailer";

let cached: Transporter | null = null;

function transporter(): Transporter | null {
  if (cached) return cached;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    // Caller decides whether absence is fatal; log once so the deploy
    // log makes the misconfiguration obvious.
    console.warn("[email] SMTP_USER / SMTP_PASS not set — email sending disabled");
    return null;
  }
  cached = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,   // 465 = implicit TLS, 587 = STARTTLS
    auth: { user, pass },
  });
  return cached;
}

export interface SendOpts {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

/** Send one email. Returns true on success, false on any failure. */
export async function sendEmail(opts: SendOpts): Promise<boolean> {
  const tx = transporter();
  if (!tx) return false;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  try {
    await tx.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      replyTo: opts.replyTo,
    });
    return true;
  } catch (e) {
    console.error("[email] send failed:", (e as Error).message);
    return false;
  }
}

/** Address that receives support notifications (admin inbox). */
export function supportEmail(): string {
  return process.env.SUPPORT_EMAIL || process.env.SMTP_USER || "";
}

/** Escape a string so it can be safely inlined into HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
