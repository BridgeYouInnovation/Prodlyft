import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { findUserById, quotaRemaining } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/crawl — auth-gated proxy. Injects user_id and pre-checks plan
 * quota so free / out-of-quota users get a fast 402 before we spin up the
 * worker. The backend re-enforces caps as defence in depth.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json(
      { error: "Sign in required to start an extract." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Plan gate.
  const user = await findUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const remaining = quotaRemaining(user);
  if (remaining !== null && remaining <= 0) {
    const plan = (user.plan || "free").toLowerCase();
    const msg =
      plan === "free"
        ? "You've used all 5 products on the free trial. Upgrade to continue."
        : "You've hit your 10,000-product monthly cap. Upgrade to Unlimited or wait for your next cycle.";
    return NextResponse.json(
      { error: msg, code: "quota_exceeded", plan, remaining: 0 },
      { status: 402 },
    );
  }

  // Clamp the requested max down to what's left. The worker will enforce again.
  const requested = typeof body.max_products === "number" ? body.max_products : null;
  let effective = requested;
  if (remaining !== null) {
    effective = requested == null ? remaining : Math.min(requested, remaining);
  }
  body.max_products = effective;
  body.user_id = userId;

  const apiUrl = process.env.API_URL ?? "http://localhost:8000";
  try {
    const upstream = await fetch(`${apiUrl}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Upstream unreachable" },
      { status: 502 },
    );
  }
}
