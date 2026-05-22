/**
 * Email-verification helpers. Re-uses the `verification_token` table
 * NextAuth's pg-adapter already created (rows: identifier, token,
 * expires) so we don't need a new schema. The identifier is the
 * lowercase email; tokens are single-use 32-byte hex strings with a
 * 24-hour expiry.
 */
import { randomBytes } from "crypto";
import { pool } from "./db";
import { escapeHtml, sendEmail } from "./email";

/** How long a verification link stays valid. */
export const VERIFICATION_TTL_HOURS = 24;
/** Minimum seconds between consecutive resend requests for the same address. */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Idempotent schema bootstrap. Two things:
 *  - Ensures `verification_token` exists (NextAuth would have created
 *    it, but a fresh DB without their adapter wouldn't have).
 *  - Backfills existing user accounts to `emailVerified = NOW()` so
 *    rolling verification out doesn't lock current users out of their
 *    own accounts. Runs once per Node process.
 */
let schemaReady: Promise<void> | null = null;
async function ensureVerificationSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_token (
        identifier TEXT NOT NULL,
        expires TIMESTAMPTZ NOT NULL,
        token TEXT NOT NULL,
        PRIMARY KEY (identifier, token)
      );
    `);
    // Backfill: anyone who already has an account is considered
    // verified (we can't ask them to re-verify retroactively). This
    // only runs on FIRST boot after this commit lands because the
    // WHERE filter naturally no-ops thereafter.
    await pool.query(`
      UPDATE users
         SET "emailVerified" = COALESCE("emailVerified", NOW())
       WHERE "emailVerified" IS NULL
         AND created_at < NOW() - INTERVAL '5 minutes';
    `);
  })().catch((e) => {
    schemaReady = null;
    throw e;
  });
  return schemaReady;
}

function newVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

export interface IssuedToken {
  token: string;
  expires: Date;
}

/**
 * Create a fresh single-use token for `email`. Any prior pending tokens
 * for the same address are deleted so the most-recent email always
 * wins. Returns both the token and its expiry timestamp.
 */
export async function issueVerificationToken(email: string): Promise<IssuedToken> {
  await ensureVerificationSchema();
  const id = email.toLowerCase();
  const token = newVerificationToken();
  const expires = new Date(Date.now() + VERIFICATION_TTL_HOURS * 3600 * 1000);
  // Single-pending-token policy keeps the table small and avoids
  // confusion when a user clicks an older link.
  await pool.query("DELETE FROM verification_token WHERE identifier = $1", [id]);
  await pool.query(
    "INSERT INTO verification_token (identifier, token, expires) VALUES ($1, $2, $3)",
    [id, token, expires],
  );
  return { token, expires };
}

/**
 * Look up + consume a token. Returns the identifier (email) on success,
 * or null if the token is unknown, expired, or already used. Tokens
 * are deleted on use so they can't be replayed.
 */
export async function consumeVerificationToken(token: string): Promise<string | null> {
  await ensureVerificationSchema();
  // DELETE … RETURNING gets us both the lookup and the consume in one
  // atomic statement, so two parallel clicks can't both mark the user
  // verified.
  const r = await pool.query<{ identifier: string; expires: string }>(
    `DELETE FROM verification_token
      WHERE token = $1
      RETURNING identifier, expires`,
    [token],
  );
  const row = r.rows[0];
  if (!row) return null;
  if (new Date(row.expires).getTime() < Date.now()) return null;
  return row.identifier;
}

/**
 * Returns the most recent pending token's `expires` for this email, or
 * null if there isn't one. The resend endpoint uses this to enforce a
 * cooldown — every fresh token's expiry is `now + 24h`, so subtracting
 * that gives us the original issue time.
 */
export async function lastTokenIssuedAt(email: string): Promise<Date | null> {
  await ensureVerificationSchema();
  const r = await pool.query<{ expires: string }>(
    "SELECT expires FROM verification_token WHERE identifier = $1 ORDER BY expires DESC LIMIT 1",
    [email.toLowerCase()],
  );
  const exp = r.rows[0]?.expires;
  if (!exp) return null;
  return new Date(new Date(exp).getTime() - VERIFICATION_TTL_HOURS * 3600 * 1000);
}

/** Build the verification URL that lands in the email. */
export function verificationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Send the verification email. Wraps sendEmail with copy that's clear
 * about what the link does and what happens if they ignore it.
 */
export async function sendVerificationEmail(opts: {
  to: string;
  url: string;
  name?: string | null;
}) {
  const greeting = opts.name ? `Hi ${escapeHtml(opts.name)},` : "Hi,";
  return sendEmail({
    to: opts.to,
    subject: "Confirm your Prodlyft email",
    text:
      `${opts.name ? `Hi ${opts.name},` : "Hi,"}\n\n` +
      `Thanks for signing up for Prodlyft. Click the link below to ` +
      `confirm your email and unlock your 10-token welcome bonus:\n\n` +
      `${opts.url}\n\n` +
      `The link expires in ${VERIFICATION_TTL_HOURS} hours. If you didn't ` +
      `sign up, you can safely ignore this email.\n`,
    html:
      `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#0E0E0C;max-width:520px">` +
      `<p>${greeting}</p>` +
      `<p>Thanks for signing up for <strong>Prodlyft</strong>. Click the button below to confirm your email and unlock your <strong>10-token welcome bonus</strong>.</p>` +
      `<p style="margin:24px 0"><a href="${escapeHtml(opts.url)}" style="background:#0E0E0C;color:#FFFFFF;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:500;display:inline-block">Confirm my email</a></p>` +
      `<p style="font-size:13px;color:#6B6B66">Or paste this link into your browser:<br><span style="font-family:ui-monospace,monospace;word-break:break-all">${escapeHtml(opts.url)}</span></p>` +
      `<p style="font-size:12px;color:#9999"; >The link expires in ${VERIFICATION_TTL_HOURS} hours. If you didn't sign up, you can safely ignore this email.</p>` +
      `</div>`,
  });
}
