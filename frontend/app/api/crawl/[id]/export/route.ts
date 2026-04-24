import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/crawl/[id]/export?format=shopify|woocommerce — ownership-gated
 * CSV download. Verifies the caller owns the crawl (or is an admin) before
 * streaming the CSV from Railway.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const sessionUser = session?.user as { id?: string | number; is_admin?: boolean } | undefined;
  const userId = Number(sessionUser?.id);
  if (!sessionUser || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await params;

  const owner = await pool.query<{ user_id: number | null }>(
    "SELECT user_id FROM crawls WHERE id = $1",
    [id],
  );
  if (owner.rowCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (owner.rows[0].user_id !== userId && !sessionUser.is_admin) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const format = req.nextUrl.searchParams.get("format") ?? "shopify";
  const apiUrl = process.env.API_URL ?? "http://localhost:8000";

  try {
    const upstream = await fetch(
      `${apiUrl}/crawl/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
      { cache: "no-store" },
    );
    const body = await upstream.arrayBuffer();
    return new NextResponse(body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/csv; charset=utf-8",
        "Content-Disposition":
          upstream.headers.get("content-disposition") ?? `attachment; filename="prodlyft-${id.slice(0, 8)}-${format}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "Upstream unreachable" },
      { status: 502 },
    );
  }
}
