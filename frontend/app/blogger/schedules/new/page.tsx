"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ScheduleForm } from "@/components/ScheduleForm";

export default function NewSchedulePage() {
  const router = useRouter();

  return (
    <Shell active="blogger" crumbs={["Auto Blogger", "New schedule"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-[680px]">
          <Link href="/blogger" className="text-[12px] text-muted hover:text-ink inline-flex items-center gap-1 mb-3">
            ← Back
          </Link>
          <h1 className="text-[20px] md:text-[22px] mb-1.5">New publishing schedule</h1>
          <p className="text-[13.5px] text-muted mb-6">
            We&apos;ll cycle through your topics on the cadence you pick. <strong>The first
            article publishes immediately</strong> (this can take 30-90 seconds), then
            future articles fire on the schedule.
          </p>

          <ScheduleForm
            submitLabel="Create schedule"
            submitActiveLabel="Creating + publishing first article…"
            onSubmit={async (values) => {
              const r = await fetch("/api/blogger/schedules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
              });
              const data = (await r.json()) as {
                id?: string;
                first_article_id?: string | null;
                first_article_error?: string | null;
                error?: string;
              };
              if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
              if (data.first_article_error) {
                throw new Error(
                  `Schedule created, but the first article didn't post: ${data.first_article_error}. ` +
                    `The schedule is still on the rails for the next tick.`,
                );
              }
              router.push("/blogger");
            }}
          />
        </div>
      </div>
    </Shell>
  );
}
