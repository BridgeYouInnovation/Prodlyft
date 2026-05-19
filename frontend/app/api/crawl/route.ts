import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { findUserById } from "@/lib/db";
import { getBalance } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * POST /api/crawl — auth-gated proxy to the FastAPI worker. Pre-flights
 * the caller's token balance so out-of-credit users get a fast 402
 * before we spin up a worker job. The worker also debits + enforces
 * tokens per product saved, so this is just a UX shortcut and a hard
 * upper bound on the requested ceiling.
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

  const user = await findUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Token gate. balance === -1 means admin / unlimited.
  const { balance } = await getBalance(userId);
  if (balance === 0) {
    return NextResponse.json(
      {
        error: "You're out of tokens. Top up to keep extracting.",
        code: "no_tokens",
        balance: 0,
      },
      { status: 402 },
    );
  }

  // Clamp the requested ceiling to the current balance so we never kick
  // off a job we know will run out mid-flight. The worker also debits one
  // token per product saved and stops gracefully if the balance hits 0
  // during the run.
  const requested = typeof body.max_products === "number" ? body.max_products : null;
  if (balance > 0) {
    const effective = requested == null ? balance : Math.min(requested, balance);
    body.max_products = effective;
  }
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
