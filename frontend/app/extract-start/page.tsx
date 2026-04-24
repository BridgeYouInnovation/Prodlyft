"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";
import { createCrawl, type Platform } from "@/lib/api";

const PENDING_KEY = "prodlyft_pending_extract";
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PendingExtract {
  url: string;
  platform?: Platform;
  max_products?: number | null;
  category_filter?: string | null;
  ts?: number;
}

export default function ExtractStart() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      let pending: PendingExtract | null = null;
      try {
        const raw = typeof window !== "undefined" ? sessionStorage.getItem(PENDING_KEY) : null;
        if (raw) pending = JSON.parse(raw) as PendingExtract;
      } catch {
        pending = null;
      }

      // No pending, or it's stale — bounce to dashboard.
      if (!pending?.url || Date.now() - (pending.ts ?? 0) > PENDING_TTL_MS) {
        try { sessionStorage.removeItem(PENDING_KEY); } catch {}
        router.replace("/dashboard");
        return;
      }

      // Clear before firing so a failed submit won't loop if the user refreshes.
      try { sessionStorage.removeItem(PENDING_KEY); } catch {}

      try {
        const { crawl_id } = await createCrawl(
          pending.url,
          pending.platform ?? "auto",
          {
            max_products: pending.max_products ?? null,
            category_filter: pending.category_filter ?? null,
          },
        );
        if (!alive) return;
        router.replace(`/crawls/${crawl_id}`);
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message);
      }
    })();

    return () => { alive = false; };
  }, [router]);

  return (
    <div className="min-h-screen grid place-items-center bg-bg px-4">
      <div className="text-center max-w-[400px]">
        <div className="flex justify-center mb-4">
          <BrandMark size={40} />
        </div>
        {err ? (
          <>
            <div className="text-[16px] font-[560] mb-2">Couldn't start the extract</div>
            <div className="text-[13px] text-danger mb-5 break-words">{err}</div>
            <Link href="/" className="btn">Back to home</Link>
          </>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 text-[14px] font-medium">
              <span className="w-4 h-4 rounded-full spin-border" style={{ border: "1.5px solid var(--ink)", borderRightColor: "transparent" }} />
              Starting your extract…
            </div>
            <div className="mt-2 text-[12.5px] text-muted">
              Queuing the URL you pasted. You'll be redirected to the results in a second.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
