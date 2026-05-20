"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ScheduleForm, type ScheduleFormValues } from "@/components/ScheduleForm";
import type { Cadence, LengthTarget, PublishStatus } from "@/lib/blogger";

interface ScheduleRow {
  id: string;
  name: string;
  wp_connection_id: string;
  topics: string[];
  tone: string | null;
  length_target: LengthTarget;
  cadence: Cadence;
  publish_status: PublishStatus;
  generate_image: boolean;
  enabled: boolean;
}

export default function EditSchedulePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [initial, setInitial] = useState<ScheduleRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/blogger/schedules/${id}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(d.error || `HTTP ${r.status}`);
        }
        return r.json() as Promise<ScheduleRow>;
      })
      .then(setInitial)
      .catch((e) => setLoadError((e as Error).message));
  }, [id]);

  async function handleSubmit(values: ScheduleFormValues) {
    const r = await fetch(`/api/blogger/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.name,
        topics: values.topics,
        tone: values.tone ?? "",
        length_target: values.length_target,
        cadence: values.cadence,
        publish_status: values.publish_status,
        generate_image: values.generate_image,
      }),
    });
    if (!r.ok) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error || `HTTP ${r.status}`);
    }
    router.push("/blogger");
  }

  return (
    <Shell active="blogger" crumbs={["Auto Blogger", "Edit schedule"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-[680px]">
          <Link
            href="/blogger"
            className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1 mb-3"
          >
            ← Back
          </Link>
          <h1 className="text-[20px] md:text-[22px] mb-1.5">Edit schedule</h1>
          <p className="text-[13.5px] text-muted mb-6">
            Updates take effect at the next cron tick. Past articles aren&apos;t affected.
          </p>

          {loadError && (
            <div className="card p-4 text-[13px] bg-warn-soft text-warn-ink">{loadError}</div>
          )}
          {!loadError && !initial && (
            <div className="text-muted text-[13px]">Loading…</div>
          )}
          {initial && (
            <ScheduleForm
              initial={{
                name: initial.name,
                wp_connection_id: initial.wp_connection_id,
                topics: initial.topics || [],
                tone: initial.tone,
                length_target: initial.length_target,
                cadence: initial.cadence,
                publish_status: initial.publish_status,
                generate_image: initial.generate_image,
              }}
              lockConnection
              submitLabel="Save changes"
              submitActiveLabel="Saving…"
              onSubmit={handleSubmit}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}
