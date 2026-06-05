import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateKeywordsForConnection } from "@/lib/keywords";

export const runtime = "nodejs";
// Two LLM calls + ~80 Google Suggest fetches, run mostly in parallel.
// Allow plenty of headroom for slow networks / cold paths.
export const maxDuration = 120;

/**
 * POST /api/blogger/keywords/generate
 * Body: { connection_id: string, count: number }
 *
 * Returns a list of SEO-friendly keyword candidates derived from the
 * user's WordPress site. See lib/keywords.ts for the full algorithm
 * (LLM seed extraction → Google Suggest expansion → LLM ranking).
 *
 * Free for the user — costs us ~$0.002 in OpenRouter spend per run.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: { connection_id?: string; count?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const connectionId = (body.connection_id || "").trim();
  if (!connectionId) {
    return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  }
  // Clamp the count both here and inside the helper — caller-visible
  // validation makes the limits obvious.
  const requested = Number(body.count);
  if (!Number.isFinite(requested) || requested < 5 || requested > 50) {
    return NextResponse.json(
      { error: "count must be between 5 and 50" },
      { status: 400 },
    );
  }

  try {
    const result = await generateKeywordsForConnection(connectionId, userId, requested);
    return NextResponse.json(result);
  } catch (e) {
    const msg = (e as Error).message || "Keyword generation failed";
    const status =
      msg.toLowerCase().includes("connection not found") ? 404 :
      msg.toLowerCase().includes("openrouter_api_key") ? 500 :
      400;
    return NextResponse.json({ error: msg }, { status });
  }
}
