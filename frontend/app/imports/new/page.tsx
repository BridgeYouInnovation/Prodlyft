"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Icons } from "@/components/Icons";
import { Stepper } from "@/components/Stepper";
import { createImport } from "@/lib/api";

export default function NewImport() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const { job_id } = await createImport(url.trim());
      router.push(`/imports/${job_id}`);
    } catch (error) {
      setErr((error as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      <Sidebar active="imports" />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={["Acme Co.", "Imports", "New import"]} />
        <div className="flex-1 overflow-auto px-8 py-7 flex flex-col items-center">
          <div className="w-[760px] max-w-full">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="chip chip-accent font-mono">STATE 1</span>
              <h2 className="text-lg">Paste URL</h2>
            </div>
            <p className="text-[13px] text-muted mb-3.5">Single product URL. Prodlyft auto-detects the page type.</p>

            <form className="card overflow-hidden" onSubmit={onSubmit}>
              <Stepper active={0} />
              <div className="p-[22px]">
                <label className="label">Product URL</label>
                <div className="flex gap-2">
                  <input
                    className="input input-mono flex-1"
                    style={{ height: 40, fontSize: 13 }}
                    placeholder="https://alba-home.myshopify.com/products/linen-apron-natural"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" disabled={submitting} className="btn-primary btn-lg">
                    {submitting ? "Queuing…" : <>Extract <Icons.ArrowRight size={13} /></>}
                  </button>
                </div>
                <div className="flex gap-4 mt-3.5">
                  {["Include variants", "Download images", "Rewrite descriptions with AI"].map((l, i) => (
                    <label key={l} className={`flex items-center gap-1.5 text-[12.5px] ${i === 2 ? "text-muted" : ""}`}>
                      <input type="checkbox" defaultChecked={i < 2} style={{ accentColor: "var(--ink)" }} />
                      {l}
                    </label>
                  ))}
                </div>
                {err && <div className="mt-3 text-[12px] text-danger">{err}</div>}
              </div>
              <div className="px-[22px] py-3.5 bg-surface2 border-t border-line flex items-center gap-2 text-[12px] text-muted">
                <Icons.Sparkle size={12} className="text-accent" />
                Auto-detects Shopify, WooCommerce, and generic product pages
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
