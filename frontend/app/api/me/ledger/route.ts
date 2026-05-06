import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listLedger } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/ledger — last 50 token credits + debits for the signed-in user. */
export async function GET() {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const rows = await listLedger(userId, 50);
  return NextResponse.json({ rows });
}
