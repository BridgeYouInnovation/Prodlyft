/**
 * Token economy — frontend / Next.js side.
 *
 * Costs:
 *   EXTRACT_PRODUCT      = 1 token / product saved
 *   BLOG_POST            = 5 tokens / article (no image)
 *   BLOG_POST_WITH_IMAGE = 10 tokens / article (with AI image)
 *
 * Admins are never charged. Every credit and debit goes into the immutable
 * `token_ledger` and updates the cached `token_balances.balance` inside the
 * same SQL transaction.
 */
import { pool } from "./db";

export const TOKEN_COSTS = {
  EXTRACT_PRODUCT: 1,
  BLOG_POST: 5,
  BLOG_POST_WITH_IMAGE: 10,
} as const;

export const SIGNUP_BONUS = 10;

export type LedgerReason =
  | "signup_bonus"
  | "migration"
  | "purchase"
  | "admin_grant"
  | "refund"
  | "extract"
  | "blog_post"
  | "blog_post_image";

export interface TokenPack {
  id: string;
  name: string;
  tokens: number;
  price_xaf: number;
  price_usd_cents: number;
  price_ngn: number;
  enabled: boolean;
  highlight: boolean;
  sort_order: number;
}

export async function listPacks(): Promise<TokenPack[]> {
  const r = await pool.query<TokenPack>(
    `SELECT id, name, tokens, price_xaf, price_usd_cents, price_ngn,
            enabled, highlight, sort_order
       FROM token_packs
      WHERE enabled = TRUE
      ORDER BY sort_order ASC, tokens ASC`,
  );
  return r.rows;
}

export async function getPack(packId: string): Promise<TokenPack | null> {
  const r = await pool.query<TokenPack>(
    `SELECT id, name, tokens, price_xaf, price_usd_cents, price_ngn,
            enabled, highlight, sort_order
       FROM token_packs
      WHERE id = $1 AND enabled = TRUE
      LIMIT 1`,
    [packId],
  );
  return r.rows[0] ?? null;
}

export interface BalanceSummary {
  /** -1 means unlimited (admin user). */
  balance: number;
  total_purchased: number;
  total_consumed: number;
  is_admin: boolean;
}

async function isAdmin(userId: number): Promise<boolean> {
  const r = await pool.query<{ is_admin: boolean }>(
    "SELECT is_admin FROM users WHERE id = $1 LIMIT 1",
    [userId],
  );
  return Boolean(r.rows[0]?.is_admin);
}

export async function getBalance(userId: number): Promise<BalanceSummary> {
  const admin = await isAdmin(userId);
  const r = await pool.query<{
    balance: number; total_purchased: number; total_consumed: number;
  }>(
    `SELECT balance, total_purchased, total_consumed
       FROM token_balances WHERE user_id = $1 LIMIT 1`,
    [userId],
  );
  const row = r.rows[0];
  return {
    balance: admin ? -1 : (row?.balance ?? 0),
    total_purchased: row?.total_purchased ?? 0,
    total_consumed: row?.total_consumed ?? 0,
    is_admin: admin,
  };
}

interface MutateOpts {
  ref_type?: string | null;
  ref_id?: string | null;
  meta?: Record<string, unknown> | null;
}

/**
 * Add tokens to a user. Idempotent for purchase / signup_bonus / migration
 * when the same (reason, ref_id) hits twice (covered by the unique partial
 * index on token_ledger). Returns the new balance.
 */
export async function creditTokens(
  userId: number,
  amount: number,
  reason: LedgerReason,
  opts: MutateOpts = {},
): Promise<number> {
  if (amount <= 0) throw new Error("credit amount must be > 0");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Idempotency: bail out silently if this credit already exists.
    if (
      (reason === "purchase" || reason === "signup_bonus" || reason === "migration") &&
      opts.ref_id
    ) {
      const existing = await client.query<{ id: string }>(
        "SELECT 1 AS id FROM token_ledger WHERE reason = $1 AND ref_id = $2 LIMIT 1",
        [reason, opts.ref_id],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        await client.query("COMMIT");
        const cur = await client.query<{ balance: number }>(
          "SELECT balance FROM token_balances WHERE user_id = $1",
          [userId],
        );
        return cur.rows[0]?.balance ?? 0;
      }
    }

    await client.query(
      `INSERT INTO token_balances (user_id, balance, total_purchased)
       VALUES ($1, $2, CASE WHEN $3 = 'purchase' THEN $2 ELSE 0 END)
       ON CONFLICT (user_id) DO UPDATE
         SET balance = token_balances.balance + EXCLUDED.balance,
             total_purchased = token_balances.total_purchased
                             + CASE WHEN $3 = 'purchase' THEN $2 ELSE 0 END,
             updated_at = NOW()`,
      [userId, amount, reason],
    );
    await client.query(
      `INSERT INTO token_ledger
         (user_id, delta, reason, ref_type, ref_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        userId,
        amount,
        reason,
        opts.ref_type ?? null,
        opts.ref_id ?? null,
        opts.meta ? JSON.stringify(opts.meta) : null,
      ],
    );
    const r = await client.query<{ balance: number }>(
      "SELECT balance FROM token_balances WHERE user_id = $1",
      [userId],
    );
    await client.query("COMMIT");
    return r.rows[0]?.balance ?? 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Try to debit `amount` tokens. Returns `{ ok, balance }`.
 *   - ok=false → user lacked tokens, no ledger row written.
 *   - admin    → always ok, balance = -1 (unlimited sentinel).
 *
 * This is the only way consumption code paths (extractor, blogger) should
 * spend tokens.
 */
export async function tryDebitTokens(
  userId: number,
  amount: number,
  reason: LedgerReason,
  opts: MutateOpts = {},
): Promise<{ ok: boolean; balance: number }> {
  if (amount <= 0) return { ok: true, balance: (await getBalance(userId)).balance };
  if (await isAdmin(userId)) return { ok: true, balance: -1 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query<{ balance: number }>(
      `UPDATE token_balances
          SET balance = balance - $2,
              total_consumed = total_consumed + $2,
              updated_at = NOW()
        WHERE user_id = $1 AND balance >= $2
        RETURNING balance`,
      [userId, amount],
    );
    if (upd.rowCount === 0) {
      const cur = await client.query<{ balance: number }>(
        "SELECT balance FROM token_balances WHERE user_id = $1",
        [userId],
      );
      await client.query("COMMIT");
      return { ok: false, balance: cur.rows[0]?.balance ?? 0 };
    }
    await client.query(
      `INSERT INTO token_ledger
         (user_id, delta, reason, ref_type, ref_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        userId,
        -amount,
        reason,
        opts.ref_type ?? null,
        opts.ref_id ?? null,
        opts.meta ? JSON.stringify(opts.meta) : null,
      ],
    );
    await client.query("COMMIT");
    return { ok: true, balance: upd.rows[0].balance };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface LedgerRow {
  id: string;
  delta: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export async function listLedger(userId: number, limit = 50): Promise<LedgerRow[]> {
  const r = await pool.query<LedgerRow>(
    `SELECT id::text, delta, reason, ref_type, ref_id, meta, created_at
       FROM token_ledger
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT $2`,
    [userId, limit],
  );
  return r.rows;
}
