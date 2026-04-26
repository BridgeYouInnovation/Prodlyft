import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { computeNextRun, generateAndPost } from "@/lib/blogger-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface DueSchedule {
  id: string;
  user_id: number;
  wp_connection_id: string;
  topics: string[];
  tone: string | null;
  length_target: string;
  publish_status: string;
  default_categories: number[] | null;
  default_tags: string[] | null;
  generate_image: boolean;
  cadence: string;
  next_topic_index: number;
}

/**
 * GET /api/cron/blog-tick — invoked by Vercel Cron once an hour.
 *
 * Auth: Vercel includes `Authorization: Bearer ${CRON_SECRET}` on every
 * cron call. We accept that header OR an internal admin call (so an admin
 * can poke the endpoint manually for debugging).
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") || "";
  if (!expected || got !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pull a small batch of due-and-enabled schedules. Cap so a long-tail
  // user can't monopolise a tick.
  const r = await pool.query<DueSchedule>(
    `SELECT id, user_id, wp_connection_id, topics, tone, length_target,
            publish_status, default_categories, default_tags, generate_image,
            cadence, next_topic_index
     FROM blog_schedules
     WHERE enabled = TRUE AND next_run_at <= NOW()
     ORDER BY next_run_at ASC
     LIMIT 20`,
  );

  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const sched of r.rows) {
    const topics = Array.isArray(sched.topics) ? sched.topics : [];
    if (topics.length === 0) {
      results.push({ id: sched.id, ok: false, error: "no topics" });
      continue;
    }
    const idx = ((sched.next_topic_index ?? 0) % topics.length + topics.length) % topics.length;
    const topic = String(topics[idx] ?? "").trim();
    if (!topic) {
      results.push({ id: sched.id, ok: false, error: "empty topic" });
      continue;
    }

    try {
      await generateAndPost({
        userId: sched.user_id,
        scheduleId: sched.id,
        connectionId: sched.wp_connection_id,
        topic,
        tone: sched.tone,
        length: (["short", "medium", "long"].includes(sched.length_target) ? sched.length_target : "medium") as "short" | "medium" | "long",
        publishStatus: sched.publish_status === "publish" ? "publish" : "draft",
        withImage: !!sched.generate_image,
        categoryIds: sched.default_categories,
        tagNames: sched.default_tags,
      });
      const nextIdx = (idx + 1) % topics.length;
      await pool.query(
        `UPDATE blog_schedules
            SET next_topic_index = $1,
                last_run_at = NOW(),
                next_run_at = $2,
                updated_at = NOW()
          WHERE id = $3`,
        [nextIdx, computeNextRun(sched.cadence), sched.id],
      );
      results.push({ id: sched.id, ok: true });
    } catch (e) {
      const msg = (e as Error).message || String(e);
      console.error(`[cron] schedule ${sched.id} failed: ${msg}`);
      // Push next_run_at forward anyway so a broken schedule doesn't loop
      // every hour. The article row records the failure.
      await pool.query(
        `UPDATE blog_schedules
            SET next_run_at = $1,
                last_run_at = NOW(),
                updated_at = NOW()
          WHERE id = $2`,
        [computeNextRun(sched.cadence), sched.id],
      );
      results.push({ id: sched.id, ok: false, error: msg.slice(0, 200) });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
