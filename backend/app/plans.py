"""Plan limits — single source of truth for quota enforcement.

Frontend has its own display-only copy in lib/plans.ts; numbers must match.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text

from .db import engine


# Free trial is a lifetime cap — 5 products total across all extracts.
FREE_LIFETIME_CAP = 5

# Pro quota is a rolling 30-day window — 10k products, then resets.
PRO_PERIOD_CAP = 10_000
PERIOD_DAYS = 30


class QuotaExceeded(Exception):
    """Raised by the worker when a crawl must be blocked (not just capped)."""


def get_user(user_id: int | None) -> dict[str, Any] | None:
    if not user_id:
        return None
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """SELECT id, email, is_admin,
                          plan, plan_period_start,
                          products_used_in_period, products_used_total
                   FROM users WHERE id = :uid"""
            ),
            {"uid": user_id},
        ).first()
    if row is None:
        return None
    return dict(row._mapping)


def maybe_reset_period(user_id: int, plan_period_start) -> None:
    """If the user's pro billing period is older than PERIOD_DAYS, start a
    fresh one. No-op for other plans — but harmless to call."""
    if plan_period_start is None:
        return
    started = plan_period_start
    if started.tzinfo is not None:
        started = started.replace(tzinfo=None)
    if (datetime.utcnow() - started) < timedelta(days=PERIOD_DAYS):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE users SET plan_period_start = NOW(), "
                "products_used_in_period = 0 WHERE id = :uid"
            ),
            {"uid": user_id},
        )


def compute_cap(user: dict[str, Any], requested_max: int | None) -> int | None:
    """Return the effective `max_products` to honour for this user's crawl.
    Raises QuotaExceeded if they have no quota left at all."""
    if not user:
        return requested_max
    if user.get("is_admin"):
        return requested_max  # admins never capped

    plan = (user.get("plan") or "free").lower()

    if plan == "unlimited":
        return requested_max

    if plan == "free":
        used = user.get("products_used_total") or 0
        remaining = FREE_LIFETIME_CAP - used
        if remaining <= 0:
            raise QuotaExceeded(
                f"Free trial used up ({used}/{FREE_LIFETIME_CAP}). Upgrade to continue."
            )
        if requested_max is None:
            return remaining
        return min(requested_max, remaining)

    if plan == "pro":
        used = user.get("products_used_in_period") or 0
        remaining = PRO_PERIOD_CAP - used
        if remaining <= 0:
            raise QuotaExceeded(
                "You've used your 10,000 products for this 30-day period. "
                "Upgrade to Unlimited or wait for the next cycle."
            )
        if requested_max is None:
            return remaining
        return min(requested_max, remaining)

    return requested_max


def record_usage(user_id: int | None, is_admin: bool, n_products: int) -> None:
    """Increment both counters after a successful crawl. Admins are tracked
    for visibility but not capped. No-ops for anonymous / orphan crawls."""
    if not user_id or n_products <= 0:
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE users SET "
                "products_used_in_period = products_used_in_period + :n, "
                "products_used_total     = products_used_total     + :n "
                "WHERE id = :uid"
            ),
            {"n": n_products, "uid": user_id},
        )
