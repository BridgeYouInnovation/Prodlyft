"""Token economy — single source of truth on the worker side.

Costs:
    EXTRACT_PRODUCT       = 1 token / product saved
    BLOG_POST             = 5 tokens / article (no image)
    BLOG_POST_WITH_IMAGE  = 10 tokens / article (with AI image)

Admins are never charged. Every credit and debit is double-bookkept: a
ledger row goes in alongside an UPDATE on the cached `token_balances`
row, both inside the same transaction.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text

from .db import engine

EXTRACT_PRODUCT = 1
BLOG_POST = 5
BLOG_POST_WITH_IMAGE = 10
SIGNUP_BONUS = 10


class InsufficientTokens(Exception):
    """Raised when a debit would put the balance below 0."""


def _is_admin(conn, user_id: int) -> bool:
    row = conn.execute(
        text("SELECT is_admin FROM users WHERE id = :uid"),
        {"uid": user_id},
    ).first()
    return bool(row and row[0])


def get_balance(user_id: int) -> int:
    """Current spendable tokens. Admins always see -1 (sentinel = unlimited)."""
    if not user_id:
        return 0
    with engine.connect() as conn:
        if _is_admin(conn, user_id):
            return -1
        row = conn.execute(
            text("SELECT balance FROM token_balances WHERE user_id = :uid"),
            {"uid": user_id},
        ).first()
        return int(row[0]) if row else 0


def credit(
    user_id: int,
    amount: int,
    reason: str,
    *,
    ref_type: str | None = None,
    ref_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> int:
    """Add tokens. Returns new balance. Idempotent for purchase/signup_bonus/migration
    when the same (reason, ref_id) is presented twice."""
    if amount <= 0:
        raise ValueError("credit amount must be > 0")
    with engine.begin() as conn:
        # If this credit was already applied (purchase/signup_bonus/migration
        # collide on the unique index), short-circuit.
        if reason in {"purchase", "signup_bonus", "migration"} and ref_id:
            existing = conn.execute(
                text(
                    "SELECT 1 FROM token_ledger WHERE reason = :r AND ref_id = :ref LIMIT 1"
                ),
                {"r": reason, "ref": ref_id},
            ).first()
            if existing:
                return get_balance(user_id)
        conn.execute(
            text(
                """INSERT INTO token_balances (user_id, balance, total_purchased)
                   VALUES (:uid, :amt, CASE WHEN :reason = 'purchase' THEN :amt ELSE 0 END)
                   ON CONFLICT (user_id) DO UPDATE
                     SET balance = token_balances.balance + EXCLUDED.balance,
                         total_purchased = token_balances.total_purchased
                                         + CASE WHEN :reason = 'purchase' THEN :amt ELSE 0 END,
                         updated_at = NOW()"""
            ),
            {"uid": user_id, "amt": amount, "reason": reason},
        )
        conn.execute(
            text(
                """INSERT INTO token_ledger
                       (user_id, delta, reason, ref_type, ref_id, meta)
                   VALUES (:uid, :delta, :reason, :rt, :ref, CAST(:meta AS JSONB))"""
            ),
            {
                "uid": user_id,
                "delta": amount,
                "reason": reason,
                "rt": ref_type,
                "ref": ref_id,
                "meta": json.dumps(meta) if meta else None,
            },
        )
        row = conn.execute(
            text("SELECT balance FROM token_balances WHERE user_id = :uid"),
            {"uid": user_id},
        ).first()
        return int(row[0]) if row else 0


def try_debit(
    user_id: int,
    amount: int,
    reason: str,
    *,
    ref_type: str | None = None,
    ref_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> tuple[bool, int]:
    """Atomically debit `amount` tokens. Returns (ok, new_balance).

    `ok=False` when the user lacks enough tokens — no ledger row is written.
    Admin users always succeed and `new_balance = -1` (unlimited sentinel).
    """
    if amount <= 0:
        return True, get_balance(user_id)
    with engine.begin() as conn:
        if _is_admin(conn, user_id):
            return True, -1
        # Conditional update — only debits when balance >= amount.
        updated = conn.execute(
            text(
                """UPDATE token_balances
                      SET balance = balance - :amt,
                          total_consumed = total_consumed + :amt,
                          updated_at = NOW()
                    WHERE user_id = :uid AND balance >= :amt
                    RETURNING balance"""
            ),
            {"uid": user_id, "amt": amount},
        ).first()
        if not updated:
            cur = conn.execute(
                text("SELECT balance FROM token_balances WHERE user_id = :uid"),
                {"uid": user_id},
            ).first()
            return False, int(cur[0]) if cur else 0
        conn.execute(
            text(
                """INSERT INTO token_ledger
                       (user_id, delta, reason, ref_type, ref_id, meta)
                   VALUES (:uid, :delta, :reason, :rt, :ref, CAST(:meta AS JSONB))"""
            ),
            {
                "uid": user_id,
                "delta": -amount,
                "reason": reason,
                "rt": ref_type,
                "ref": ref_id,
                "meta": json.dumps(meta) if meta else None,
            },
        )
        return True, int(updated[0])
