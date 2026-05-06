/**
 * Lightweight signup abuse guards. The goal is not to block real users, just
 * to make farming the 10-token signup bonus uneconomical.
 *
 *   1. Disposable / throwaway email domains never receive the bonus.
 *   2. Same-IP cooldown: only one signup_bonus per IP every COOLDOWN_DAYS.
 *
 * Failing either check still creates the account — it just lands with a
 * 0-token balance and a "top up to start" CTA. That keeps the funnel open
 * without leaking tokens to bot rings.
 */
import type { NextRequest } from "next/server";

import { pool } from "./db";

const COOLDOWN_DAYS = 7;

// Curated list of the most common disposable-mail providers. Not exhaustive
// (no list is); covers the ones that show up in spam signups daily.
const DISPOSABLE_DOMAINS = new Set<string>([
  "10minutemail.com", "10minutemail.net", "20minutemail.com",
  "discard.email", "discardmail.com", "dispostable.com",
  "fakeinbox.com", "fakemailgenerator.com", "fakemail.net",
  "getnada.com", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de",
  "inboxbear.com", "mailcatch.com", "mailinator.com",
  "mailinator.net", "maildrop.cc", "mintemail.com",
  "mohmal.com", "moakt.com", "tempmail.com", "tempmailo.com",
  "temp-mail.org", "temp-mail.io", "tempmail.dev",
  "throwawaymail.com", "trashmail.com", "yopmail.com",
  "yopmail.net", "spambog.com", "sharklasers.com",
  "spam4.me", "emailondeck.com", "anonbox.net",
  "sneakemail.com", "tempinbox.com", "trbvm.com",
  "33mail.com", "byom.de", "armyspy.com", "cuvox.de",
  "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com",
  "jourrapide.com", "rhyta.com", "superrito.com",
  "teleworm.us", "tmpmail.org", "tmpmail.net",
  "burnermail.io", "spamgourmet.com", "trashmail.de",
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  return DISPOSABLE_DOMAINS.has(domain);
}

export function pickClientIp(req: NextRequest | Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

/**
 * True when the same IP has *already* received a signup bonus within the
 * cooldown window. Caller should still create the account, just skip the
 * bonus credit.
 */
export async function ipBonusOnCooldown(ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const r = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n
       FROM users u
       JOIN token_ledger l
         ON l.user_id = u.id AND l.reason = 'signup_bonus'
      WHERE u.signup_ip = $1
        AND l.created_at > NOW() - INTERVAL '${COOLDOWN_DAYS} days'`,
    [ip],
  );
  return Number(r.rows[0]?.n || 0) > 0;
}

export interface SignupBonusDecision {
  /** Grant the 10-token bonus? */
  grant: boolean;
  /** Human-readable reason when we declined. Logged, never shown to user. */
  reason: string;
}

export async function decideSignupBonus(
  email: string,
  ip: string | null,
): Promise<SignupBonusDecision> {
  if (isDisposableEmail(email)) {
    return { grant: false, reason: "disposable email domain" };
  }
  if (await ipBonusOnCooldown(ip)) {
    return { grant: false, reason: `IP ${ip} on ${COOLDOWN_DAYS}d cooldown` };
  }
  return { grant: true, reason: "ok" };
}
