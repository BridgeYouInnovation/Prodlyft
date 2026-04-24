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
  is_admin: boolean;
  plan: string;
  plan_period_start: string | null;
  products_used_in_period: number;
  products_used_total: number;
  created_at: string | null;
}

const SELECT_USER = `
  SELECT id, email, name, image, password, is_admin,
         plan, plan_period_start,
         products_used_in_period, products_used_total,
         created_at
  FROM users
`;

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  const r = await pool.query<DbUser>(
    `${SELECT_USER} WHERE lower(email) = lower($1) LIMIT 1`,
    [email],
  );
  return r.rows[0] ?? null;
}

export async function findUserById(id: number): Promise<DbUser | null> {
  const r = await pool.query<DbUser>(`${SELECT_USER} WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0] ?? null;
}

export async function createUser(
  email: string,
  passwordHash: string,
  name: string | null = null,
): Promise<DbUser> {
  const r = await pool.query<DbUser>(
    `INSERT INTO users (email, password, name) VALUES ($1, $2, $3)
     RETURNING id, email, name, image, password, is_admin,
               plan, plan_period_start,
               products_used_in_period, products_used_total, created_at`,
    [email, passwordHash, name],
  );
  return r.rows[0];
}

/** How many more products this user can still extract right now. `null` = unlimited. */
export function quotaRemaining(u: Pick<DbUser, "plan" | "products_used_in_period" | "products_used_total" | "is_admin">): number | null {
  if (u.is_admin) return null;
  const plan = (u.plan || "free").toLowerCase();
  if (plan === "unlimited") return null;
  if (plan === "pro") return Math.max(0, 10_000 - (u.products_used_in_period || 0));
  // free — lifetime cap of 5
  return Math.max(0, 5 - (u.products_used_total || 0));
}
