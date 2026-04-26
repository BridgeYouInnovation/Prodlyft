import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { generateAndPost } from "@/lib/blogger-engine";
import type { LengthTarget, PublishStatus } from "@/lib/blogger";

export const runtime = "nodejs";
export const maxDuration = 300; // Vercel: allow up to 5 min for AI + WP round-trip.

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let body: {
    connection_id?: string;
    topic?: string;
    tone?: string;
    length?: LengthTarget;
    publish_status?: PublishStatus;
    generate_image?: boolean;
    category_ids?: number[];
    tag_names?: string[];
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.connection_id) return NextResponse.json({ error: "connection_id required" }, { status: 400 });
  const topic = (body.topic || "").trim();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  try {
    const out = await generateAndPost({
      userId,
      connectionId: body.connection_id,
      topic,
      tone: body.tone || null,
      length: (body.length as LengthTarget) || "medium",
      publishStatus: body.publish_status === "publish" ? "publish" : "draft",
      withImage: body.generate_image !== false,
      categoryIds: body.category_ids ?? null,
      tagNames: body.tag_names ?? null,
    });
    return NextResponse.json({ ok: true, article_id: out.articleId });
  } catch (e) {
    const msg = (e as Error).message || String(e);
    const code = msg.toLowerCase().includes("quota") ? 402 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
