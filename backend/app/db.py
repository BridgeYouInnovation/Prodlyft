from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()


def _normalize_db_url(url: str) -> str:
    """Force SQLAlchemy to use psycopg (v3) — the only driver we install.

    Railway's auto-injected DATABASE_URL is `postgresql://…` (no driver
    hint), which SQLAlchemy defaults to psycopg2. Since requirements.txt
    only has psycopg v3, that path fails at import with
    `ModuleNotFoundError: No module named 'psycopg2'`. Rewrite the scheme
    to `postgresql+psycopg://` so we always land on the installed driver.
    """
    if url.startswith("postgresql://"):
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    return url


engine = create_engine(
    _normalize_db_url(settings.database_url),
    pool_pre_ping=True,
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


# Tables required by Auth.js (@auth/pg-adapter). Created alongside our app
# tables so the Next.js frontend can persist users/sessions in the same DB.
_AUTH_JS_SQL = """
CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT,
  password TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS products_used_in_period INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS products_used_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_ip VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_bonus_granted BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_users_signup_ip ON users(signup_ip) WHERE signup_ip IS NOT NULL;

-- Token economy. Tokens replace the old plan-based quotas:
--   1 token  = 1 product extracted
--   5 tokens = 1 blog post (no image)
--   10 tokens = 1 blog post with AI image
--
-- token_balances is the cached current balance — always equal to the sum of
-- the user's ledger rows. Ledger rows are immutable; balance updates happen
-- inside the same transaction as the ledger insert (see app/tokens.py).
CREATE TABLE IF NOT EXISTS token_balances (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_consumed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS token_ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason VARCHAR(40) NOT NULL,
  ref_type VARCHAR(30),
  ref_id TEXT,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_ledger_user
  ON token_ledger(user_id, created_at DESC);
-- Idempotency on credits — a payment ref / signup bonus / migration entry
-- can only grant tokens once even if the webhook or init retries.
CREATE UNIQUE INDEX IF NOT EXISTS uq_token_ledger_credit_ref
  ON token_ledger(reason, ref_id)
  WHERE reason IN ('purchase', 'signup_bonus', 'migration');

-- Pack catalog. We seed the 4 packs below on init; admins can disable a pack
-- by flipping `enabled` to FALSE.
CREATE TABLE IF NOT EXISTS token_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  price_xaf INTEGER NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  price_ngn INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  highlight BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_packs (id, name, tokens, price_xaf, price_usd_cents, price_ngn, highlight, sort_order)
VALUES
  ('starter',  'Starter',  100,    3000,    500, 7500,   FALSE, 1),
  ('creator',  'Creator',  1000,  17500,   2900, 44000,  TRUE,  2),
  ('business', 'Business', 5000,  60000,   9900, 150000, FALSE, 3),
  ('scale',    'Scale',    25000, 240000, 39900, 600000, FALSE, 4)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE crawls ADD COLUMN IF NOT EXISTS max_products INTEGER;
ALTER TABLE crawls ADD COLUMN IF NOT EXISTS category_filter VARCHAR(255);
ALTER TABLE crawls ADD COLUMN IF NOT EXISTS user_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_crawls_user_id ON crawls(user_id);

-- Support tickets — a lightweight live-chat thread between a user and an
-- admin. Auto-suggested when a crawl fails so the user can ask for help.
CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  subject VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  related_crawl_id TEXT,
  last_user_view_at TIMESTAMPTZ,
  last_admin_view_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_updated_at ON tickets(updated_at DESC);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_user_id INTEGER NOT NULL,
  sender_role VARCHAR(10) NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id, created_at);

-- Auto Blogger: connection from a Prodlyft user to one of their WordPress
-- sites, plus the schedules and articles produced through that link.
CREATE TABLE IF NOT EXISTS wp_connections (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  site_url TEXT NOT NULL,
  site_name TEXT,
  api_key TEXT NOT NULL,
  wp_version TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wp_connections_user_id ON wp_connections(user_id);

CREATE TABLE IF NOT EXISTS blog_schedules (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  wp_connection_id TEXT NOT NULL REFERENCES wp_connections(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  topics JSONB NOT NULL,
  tone TEXT,
  length_target VARCHAR(10) NOT NULL DEFAULT 'medium',
  cadence VARCHAR(20) NOT NULL DEFAULT 'weekly',
  publish_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  default_categories JSONB,
  default_tags JSONB,
  generate_image BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  next_topic_index INTEGER NOT NULL DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_schedules_user_id ON blog_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_schedules_due ON blog_schedules(next_run_at) WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS blog_articles (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  wp_connection_id TEXT REFERENCES wp_connections(id) ON DELETE SET NULL,
  schedule_id TEXT REFERENCES blog_schedules(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  tone TEXT,
  title TEXT,
  excerpt TEXT,
  body TEXT,
  image_url TEXT,
  image_prompt TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  publish_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  wp_post_id INTEGER,
  wp_post_url TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blog_articles_user_id ON blog_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_articles_schedule ON blog_articles(schedule_id);

-- My-CoolPay payments.
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  plan VARCHAR(20) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'XAF',
  app_transaction_ref TEXT UNIQUE NOT NULL,
  mcp_transaction_ref TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'created',
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
"""


def _seed_admin() -> None:
    """Create/ensure the admin account from ADMIN_SEED_EMAIL/ADMIN_SEED_PASSWORD env vars."""
    email = (settings.admin_seed_email or "").strip().lower()
    password = settings.admin_seed_password or ""
    if not email or not password:
        return
    try:
        import bcrypt
        pw_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=10)).decode("utf-8")
    except Exception as e:
        print(f"[seed_admin] bcrypt error: {e}", flush=True)
        return
    with engine.begin() as conn:
        row = conn.execute(
            text("SELECT id, is_admin FROM users WHERE lower(email) = :e"),
            {"e": email},
        ).first()
        if row is None:
            conn.execute(
                text(
                    'INSERT INTO users (email, password, is_admin) VALUES (:e, :p, TRUE)'
                ),
                {"e": email, "p": pw_hash},
            )
            print(f"[seed_admin] created admin: {email}", flush=True)
        else:
            conn.execute(
                text('UPDATE users SET is_admin = TRUE, password = :p WHERE id = :id'),
                {"p": pw_hash, "id": row[0]},
            )
            print(f"[seed_admin] ensured admin + refreshed password: {email}", flush=True)


def _backfill_token_balances() -> None:
    """One-shot migration from plan-based quotas to token balances.

    Idempotent: runs only for users that have no `token_balances` row yet.
    Each user's remaining plan quota is converted into a starting token
    balance, audited as a single 'migration' ledger entry.
    """
    with engine.begin() as conn:
        users = conn.execute(
            text(
                """SELECT u.id, u.is_admin,
                          COALESCE(LOWER(u.plan), 'free') AS plan,
                          COALESCE(u.products_used_in_period, 0) AS used_period,
                          COALESCE(u.products_used_total, 0)     AS used_total
                   FROM users u
                   LEFT JOIN token_balances tb ON tb.user_id = u.id
                   WHERE tb.user_id IS NULL"""
            )
        ).fetchall()
        for u in users:
            uid = u[0]
            is_admin = bool(u[1])
            plan = u[2]
            used_period = int(u[3])
            used_total = int(u[4])

            if is_admin:
                tokens = 0  # admins bypass debits anyway
            elif plan == "unlimited":
                tokens = 50_000  # one-time grandfather grant
            elif plan == "pro":
                tokens = max(0, 10_000 - used_period)
            else:  # free
                tokens = max(0, 5 - used_total)
            # Floor every non-admin user at the new 10-token signup bonus so
            # nobody loses access during the cutover.
            if not is_admin and tokens < 10:
                tokens = 10

            conn.execute(
                text(
                    "INSERT INTO token_balances (user_id, balance) VALUES (:uid, :t) "
                    "ON CONFLICT (user_id) DO NOTHING"
                ),
                {"uid": uid, "t": tokens},
            )
            if tokens > 0:
                conn.execute(
                    text(
                        """INSERT INTO token_ledger
                              (user_id, delta, reason, ref_type, ref_id, meta)
                           VALUES (:uid, :t, 'migration', 'user', :ref,
                                   CAST(:meta AS JSONB))
                           ON CONFLICT DO NOTHING"""
                    ),
                    {
                        "uid": uid,
                        "t": tokens,
                        "ref": str(uid),
                        "meta": f'{{"old_plan":"{plan}","used_period":{used_period},"used_total":{used_total}}}',
                    },
                )
        if users:
            print(f"[backfill_tokens] migrated {len(users)} user(s)", flush=True)


def init_db() -> None:
    from . import models  # noqa: F401
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for stmt in _AUTH_JS_SQL.strip().split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
    _seed_admin()
    _backfill_token_balances()


@contextmanager
def session_scope():
    s = SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()
