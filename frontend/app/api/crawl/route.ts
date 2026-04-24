import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

/**
 * POST /api/crawl — auth-gated proxy to the Railway backend.
 *
 * Direct hits to the Railway API still work for GET/DELETE paths via the
 * fallback rewrite in next.config.js, but creating a new crawl requires a
 * signed-in session. Anonymous POSTs get a 401 so the client can redirect
 * to sign-up without spending Playwright time.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Sign in required to start an extract." },
      { status: 401 },
    );
  }

  const apiUrl = process.env.API_URL ?? "http://localhost:8000";
  const body = await req.text();

  try {
    const upstream = await fetch(`${apiUrl}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
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
