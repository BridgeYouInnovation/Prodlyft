"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Stepper } from "@/components/Stepper";
import { Icons } from "@/components/Icons";
import { getJob, type Job } from "@/lib/api";

const STEPS = [
  { key: "queued", label: "Queued" },
  { key: "fetching", label: "Fetching page" },
  { key: "parsing", label: "Parsing product schema" },
  { key: "extracting", label: "Extracting fields" },
  { key: "cleaning", label: "Cleaning with AI" },
  { key: "done", label: "Ready" },
];

export default function ImportDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const j = await getJob(id);
        if (!alive) return;
        setJob(j);
        if (j.status === "done" || j.status === "failed") return;
        setTimeout(tick, 1500);
      } catch (e) {
        if (!alive) return;
        setErr((e as Error).message);
      }
    };
    tick();
    return () => { alive = false; };
  }, [id]);

  const currentStep = job?.progress?.step as string | undefined;
  const stepIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentStep));
  const stepperActive =
    job?.status === "done" ? 3 :
    job?.status === "failed" ? 1 :
    stepIdx >= 4 ? 2 : 1;

  return (
    <div className="min-h-screen flex">
      <Sidebar active="imports" />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={["Acme Co.", "Imports", id.slice(0, 8)]} />
        <div className="flex-1 overflow-auto px-8 py-7 flex flex-col items-center gap-10">
          {err && <div className="text-[12px] text-danger">{err}</div>}

          {job && (job.status === "pending" || job.status === "processing") && (
            <div className="w-[760px] max-w-full">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="chip chip-accent font-mono">STATE 2</span>
                <h2 className="text-lg">Extracting…</h2>
              </div>
              <p className="text-[13px] text-muted mb-3.5">Live progress. Each step runs on the worker.</p>
              <div className="card overflow-hidden">
                <Stepper active={stepperActive} />
                <div className="p-[22px]">
                  <div className="font-mono text-[11.5px] text-muted mb-3.5 break-all">{job.url}</div>
                  {STEPS.slice(1).map((s, i) => {
                    const pos = i + 1;
                    const state = pos < stepIdx ? "done" : pos === stepIdx ? "active" : "pending";
                    return (
                      <div key={s.key} className={`flex items-center gap-2.5 py-2 ${i === STEPS.length - 2 ? "" : "border-b border-line-2"}`}>
                        {state === "done" && (
                          <div className="w-4 h-4 rounded-full grid place-items-center text-white" style={{ background: "var(--accent)" }}>
                            <Icons.Check size={10} stroke={2.5} />
                          </div>
                        )}
                        {state === "active" && (
                          <div
                            className="w-4 h-4 rounded-full spin-border"
                            style={{ border: "1.5px solid var(--ink)", borderRightColor: "transparent" }}
                          />
                        )}
                        {state === "pending" && <div className="w-4 h-4 rounded-full" style={{ border: "1px dashed var(--line)" }} />}
                        <span className={`text-[13px] flex-1 ${state === "pending" ? "text-muted-2" : "text-ink"}`}>{s.label}</span>
                      </div>
                    );
                  })}
                  <div className="mt-4 h-[3px] bg-line-2 rounded-full overflow-hidden">
                    <div className="h-full bg-ink transition-[width]" style={{ width: `${Math.min(100, (stepIdx / (STEPS.length - 1)) * 100)}%` }} />
                  </div>
                  <div className="mt-2 text-[11.5px] text-muted flex">
                    <span>Extracting — typically 5–15 seconds</span>
                    <div className="flex-1" />
                    <span>{Math.max(0, stepIdx)} of {STEPS.length - 1}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {job?.status === "failed" && (
            <div className="w-[760px] max-w-full">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="chip font-mono" style={{ color: "var(--danger)" }}>FAILED</span>
                <h2 className="text-lg">Extraction failed</h2>
              </div>
              <div className="card p-[22px]">
                <div className="font-mono text-[11.5px] text-muted mb-2 break-all">{job.url}</div>
                <div className="text-[13px] text-ink-2 whitespace-pre-wrap">{job.error || "Unknown error"}</div>
                <div className="flex gap-2 mt-4">
                  <Link href="/imports/new" className="btn">Start over</Link>
                  <Link href="/dashboard" className="btn-ghost">Back to dashboard</Link>
                </div>
              </div>
            </div>
          )}

          {job?.status === "done" && job.result && (
            <div className="w-[760px] max-w-full">
              <div className="flex items-center gap-2.5 mb-2">
                <span className="chip chip-accent font-mono">STATE 3</span>
                <h2 className="text-lg">Review</h2>
              </div>
              <p className="text-[13px] text-muted mb-3.5">All fields extracted and cleaned. Edit or export.</p>
              <div className="card overflow-hidden">
                <Stepper active={2} />
                <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <div className="p-[22px] border-r border-line">
                    <div className="text-[11px] text-muted uppercase tracking-wider mb-2">Extracted</div>
                    <div className="text-[20px] font-[560] tracking-tight2">{job.result.title ?? "—"}</div>
                    <div className="text-[12px] text-muted mt-0.5 mb-4 font-mono break-all">
                      {job.result.sku ?? "—"} · {new URL(job.url).hostname}
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div><div className="text-[10.5px] text-muted uppercase">Price</div><div className="text-sm font-medium">{job.result.price != null ? `${job.result.currency || "USD"} ${job.result.price}` : "—"}</div></div>
                      <div><div className="text-[10.5px] text-muted uppercase">Stock</div><div className="text-sm font-medium">{job.result.in_stock == null ? "—" : job.result.in_stock ? "In stock" : "Out"}</div></div>
                      <div><div className="text-[10.5px] text-muted uppercase">Images</div><div className="text-sm font-medium">{job.result.images?.length ?? 0}</div></div>
                    </div>
                    {job.result.short_description && (
                      <div className="text-[12.5px] leading-[1.55] text-ink-2 mb-3">{job.result.short_description}</div>
                    )}
                    {job.result.description && (
                      <div className="text-[12.5px] leading-[1.55] text-ink-2 whitespace-pre-line" style={{ maxHeight: 200, overflow: "auto" }}>
                        {job.result.description}
                      </div>
                    )}
                    <div className="mt-3.5 flex gap-2 flex-wrap">
                      {(job.result.categories || []).map((c) => <span key={c} className="chip">{c}</span>)}
                      {(job.result.tags || []).map((c) => <span key={c} className="chip chip-ghost">{c}</span>)}
                    </div>
                  </div>
                  <div className="p-[22px] bg-surface2">
                    {job.result.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={job.result.images[0]} alt="" className="w-full rounded border border-line object-cover mb-2" style={{ aspectRatio: "1/1" }} />
                    ) : (
                      <div className="ph w-full mb-2" style={{ aspectRatio: "1/1" }}>NO IMAGE</div>
                    )}
                    <div className="grid grid-cols-5 gap-1.5">
                      {(job.result.images || []).slice(1, 6).map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={src} alt="" className="rounded border border-line object-cover" style={{ aspectRatio: "1/1" }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="px-[22px] py-3 bg-surface2 border-t border-line flex items-center">
                  <Link href="/imports/new" className="btn-sm btn-ghost">Back</Link>
                  <div className="flex-1" />
                  <button
                    className="btn-sm"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(job.result, null, 2)], { type: "application/json" });
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `prodlyft-${id.slice(0, 8)}.json`;
                      a.click();
                    }}
                  >
                    Download JSON
                  </button>
                  <Link href={`/products/${id}`} className="btn-sm btn-primary ml-2">
                    Continue to editor <Icons.ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
