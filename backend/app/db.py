from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
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


def init_db() -> None:
    from . import models  # noqa: F401
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        for stmt in _AUTH_JS_SQL.strip().split(";"):
            s = stmt.strip()
            if s:
                conn.execute(text(s))
    _seed_admin()


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
