import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

export const pool: Pool =
  global.__pgPool ??
  new Pool({
    connectionString,
    ssl: connectionString?.includes("railway") ? { rejectUnauthorized: false } : undefined,
    max: 3,
  });

if (process.env.NODE_ENV !== "production") {
  global.__pgPool = pool;
}

export interface DbUser {
  id: number;
  email: string;
  name: string | null;
  image: string | null;
  password: string | null;
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const r = await pool.query<DbUser>(
    'SELECT id, email, name, image, password FROM users WHERE lower(email) = lower($1) LIMIT 1',
    [email],
  );
  return r.rows[0] ?? null;
}

export async function createUser(email: string, passwordHash: string, name: string | null = null): Promise<DbUser> {
  const r = await pool.query<DbUser>(
    'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name, image, password',
    [email, passwordHash, name],
  );
  return r.rows[0];
}
