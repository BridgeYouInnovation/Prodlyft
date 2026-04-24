import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/crawl/[id] — ownership-gated proxy.
 *
 * Checks the crawl's user_id against the signed-in session before forwarding
 * to the Railway backend. Admins can view any crawl (they need a way to
 * verify extracts from the user dashboard, not just /admin/*).
 *
 * A missing-or-mismatched owner returns 404 rather than 403 so we don't leak
 * the existence of crawls that don't belong to the caller.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sessionUser = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  const userId = Number(sessionUser?.id);
  if (!sessionUser || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;

  // Ownership check — cheap single-row query.
  const owner = await pool.query<{ user_id: number | null }>(
    "SELECT user_id FROM crawls WHERE id = $1",
    [id],
  );
  if (owner.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const crawlUserId = owner.rows[0].user_id;
  if (crawlUserId !== userId && !sessionUser.is_admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const apiUrl = process.env.API_URL ?? "http://localhost:8000";
  const includeProducts = req.nextUrl.searchParams.get("include_products") ?? "true";

  try {
    const upstream = await fetch(
      `${apiUrl}/crawl/${encodeURIComponent(id)}?include_products=${encodeURIComponent(includeProducts)}`,
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
