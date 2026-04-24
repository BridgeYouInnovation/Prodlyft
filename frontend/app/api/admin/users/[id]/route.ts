import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

const VALID_PLANS = new Set(["free", "pro", "unlimited"]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: string | null;
    is_admin?: boolean;
    plan?: string;
    reset_usage?: boolean;
  };

  const sets: string[] = [];
  const vals: unknown[] = [];

  if ("name" in body) {
    sets.push(`name = $${sets.length + 1}`);
    vals.push(body.name ?? null);
  }
  if (typeof body.is_admin === "boolean") {
    sets.push(`is_admin = $${sets.length + 1}`);
    vals.push(body.is_admin);
  }
  if (typeof body.plan === "string") {
    const plan = body.plan.toLowerCase();
    if (!VALID_PLANS.has(plan)) {
      return NextResponse.json({ error: "plan must be free | pro | unlimited" }, { status: 400 });
    }
    sets.push(`plan = $${sets.length + 1}`);
    vals.push(plan);
    // Plan changes always reset the rolling period so the new quota is fresh.
    sets.push(`plan_period_start = NOW()`);
    sets.push(`products_used_in_period = 0`);
  }
  if (body.reset_usage) {
    sets.push(`products_used_in_period = 0`);
    sets.push(`products_used_total = 0`);
    sets.push(`plan_period_start = NOW()`);
  }

  if (sets.length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  vals.push(userId);
  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = $${vals.length}`, vals);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireAdmin();
  if (!check.ok) return check.res;
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  if (userId === check.userId) {
    return NextResponse.json({ error: "Cannot delete your own admin account." }, { status: 400 });
  }
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  return NextResponse.json({ ok: true });
}
