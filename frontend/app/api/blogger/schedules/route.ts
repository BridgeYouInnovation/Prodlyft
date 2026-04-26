import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { computeNextRun } from "@/lib/blogger-engine";
import type { Cadence, LengthTarget, PublishStatus } from "@/lib/blogger";

export const runtime = "nodejs";

const VALID_CADENCE = new Set<Cadence>(["hourly", "daily", "weekly", "monthly"]);
const VALID_LENGTH = new Set<LengthTarget>(["short", "medium", "long"]);

function newId(): string {
  const buf = crypto.getRandomValues(new Uint8Array(9));
  return "sch_" + Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function GET() {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const r = await pool.query(
    `SELECT s.*, c.site_url AS site_url, c.site_name AS site_name,
       (SELECT COUNT(*)::int FROM blog_articles a WHERE a.schedule_id = s.id) AS article_count
     FROM blog_schedules s
     JOIN wp_connections c ON c.id = s.wp_connection_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId],
  );
  return NextResponse.json(r.rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const userId = Number((session?.user as { id?: string | number } | undefined)?.id);
  if (!session?.user || !Number.isFinite(userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  let body: {
    name?: string;
    wp_connection_id?: string;
    topics?: string[];
    tone?: string;
    length_target?: LengthTarget;
    cadence?: Cadence;
    publish_status?: PublishStatus;
    default_categories?: number[];
    default_tags?: string[];
    generate_image?: boolean;
  } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  const connId = (body.wp_connection_id || "").trim();
  const topics = Array.isArray(body.topics)
    ? body.topics.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const cadence = (body.cadence || "weekly") as Cadence;
  const length = (body.length_target || "medium") as LengthTarget;
  const pub = body.publish_status === "publish" ? "publish" : "draft";

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!connId) return NextResponse.json({ error: "Pick a connected site" }, { status: 400 });
  if (topics.length === 0) return NextResponse.json({ error: "Add at least one topic" }, { status: 400 });
  if (!VALID_CADENCE.has(cadence)) return NextResponse.json({ error: "Bad cadence" }, { status: 400 });
  if (!VALID_LENGTH.has(length)) return NextResponse.json({ error: "Bad length" }, { status: 400 });

  // Confirm the connection belongs to this user.
  const cc = await pool.query<{ id: string }>(
    "SELECT id FROM wp_connections WHERE id = $1 AND user_id = $2",
    [connId, userId],
  );
  if (cc.rowCount === 0) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const id = newId();
  const next = computeNextRun(cadence);
  await pool.query(
    `INSERT INTO blog_schedules
       (id, user_id, wp_connection_id, name, topics, tone, length_target,
        cadence, publish_status, default_categories, default_tags,
        generate_image, enabled, next_topic_index, next_run_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7,
             $8, $9, $10::jsonb, $11::jsonb,
             $12, TRUE, 0, $13)`,
    [
      id,
      userId,
      connId,
      name,
      JSON.stringify(topics),
      body.tone || null,
      length,
      cadence,
      pub,
      JSON.stringify(body.default_categories || null),
      JSON.stringify(body.default_tags || null),
      body.generate_image !== false,
      next,
    ],
  );
  return NextResponse.json({ id }, { status: 201 });
}
