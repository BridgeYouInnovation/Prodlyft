import { NextResponse } from "next/server";
import { listPacks } from "@/lib/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/packs — public list of token packs available for purchase. */
export async function GET() {
  const packs = await listPacks();
  return NextResponse.json({ packs });
}
