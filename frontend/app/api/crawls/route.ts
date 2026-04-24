import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

/**
 * GET /api/crawls — returns crawls owned by the signed-in user only.
 * Forwards to the Railway backend with ?user_id=<session.user.id>.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
  const apiUrl = process.env.API_URL ?? "http://localhost:8000";

  try {
    const upstream = await fetch(
      `${apiUrl}/crawls?limit=${encodeURIComponent(String(limit))}&user_id=${userId}`,
      { cache: "no-store" },
    );
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
