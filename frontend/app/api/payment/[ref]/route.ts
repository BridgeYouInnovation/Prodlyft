import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/payment/[ref] — return the status of one of the caller's
 * payments. Used by the /pricing/success page to poll until MCP's callback
 * lands (usually ~seconds after the payer confirms on the MCP checkout).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { ref } = await params;

  const r = await pool.query(
    `SELECT id, user_id, plan, amount, currency, status, app_transaction_ref,
            mcp_transaction_ref, created_at, updated_at
     FROM payments WHERE app_transaction_ref = $1`,
    [ref],
  );
  if (r.rowCount === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const p = r.rows[0];
  if (p.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(p);
}
