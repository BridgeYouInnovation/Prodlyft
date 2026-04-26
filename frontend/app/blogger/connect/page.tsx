"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";

export default function BloggerConnect() {
  const router = useRouter();
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ site_name: string | null; site_url: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/blogger/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_url: siteUrl.trim(), api_key: apiKey.trim() }),
      });
      const data = (await r.json()) as { error?: string; site_url: string; site_name: string | null };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setResult({ site_url: data.site_url, site_name: data.site_name });
      // Wait a beat so the user sees the success state.
      setTimeout(() => router.push("/blogger"), 1200);
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Shell active="blogger" crumbs={["Auto Blogger", "Connect WordPress"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7">
        <div className="max-w-[760px]">
          <h1 className="text-[20px] md:text-[22px] mb-1.5">Connect a WordPress site</h1>
          <p className="text-[13.5px] text-muted mb-6 max-w-[560px]">
            Three steps. Takes about two minutes.
          </p>

          <ol className="grid gap-4 mb-8">
            {/* Step 1 */}
            <li className="card p-5">
              <div className="flex items-baseline gap-2.5 mb-2">
                <span className="font-mono text-[11px] text-muted">01</span>
                <span className="text-[15px] font-[560] tracking-tight2">Install the plugin</span>
              </div>
              <p className="text-[13px] text-muted leading-[1.55] mb-3">
                Download the Prodlyft Publisher plugin and upload it via{" "}
                <span className="font-mono">Plugins → Add New → Upload Plugin</span> on your WordPress site, then activate it.
              </p>
              <a
                href="/downloads/prodlyft-publisher.zip"
                download
                className="btn"
              >
                <Icons.Download size={13} /> Download plugin (.zip)
              </a>
            </li>

            {/* Step 2 */}
            <li className="card p-5">
              <div className="flex items-baseline gap-2.5 mb-2">
                <span className="font-mono text-[11px] text-muted">02</span>
                <span className="text-[15px] font-[560] tracking-tight2">Generate an API key</span>
              </div>
              <p className="text-[13px] text-muted leading-[1.55]">
                In your WordPress admin, go to{" "}
                <span className="font-mono">Settings → Prodlyft Publisher</span> and click{" "}
                <span className="font-mono">Generate API key</span>. Copy the 48-character key — it's only shown once.
              </p>
            </li>

            {/* Step 3 */}
            <li className="card p-5">
              <div className="flex items-baseline gap-2.5 mb-3">
                <span className="font-mono text-[11px] text-muted">03</span>
                <span className="text-[15px] font-[560] tracking-tight2">Paste it here</span>
              </div>

              {result ? (
                <div className="p-3 rounded-md bg-accent-soft text-accent-ink text-[13px] flex items-center gap-2">
                  <Icons.Check size={16} stroke={2.5} />
                  Connected to <strong>{result.site_name || result.site_url}</strong>. Redirecting…
                </div>
              ) : (
                <form onSubmit={onSubmit} className="grid gap-3">
                  <div>
                    <label className="label">WordPress site URL</label>
                    <input
                      className="input input-mono"
                      placeholder="https://yoursite.com"
                      value={siteUrl}
                      onChange={(e) => setSiteUrl(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">API key</label>
                    <input
                      className="input input-mono"
                      placeholder="48-character key from the plugin settings page"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      required
                      minLength={24}
                    />
                  </div>
                  {err && (
                    <div className="p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">{err}</div>
                  )}
                  <div className="flex justify-end gap-2 mt-1">
                    <Link href="/blogger" className="btn">Cancel</Link>
                    <button type="submit" disabled={submitting} className="btn-primary btn-lg">
                      {submitting ? "Verifying…" : <>Connect <Icons.ArrowRight size={14} /></>}
                    </button>
                  </div>
                </form>
              )}
            </li>
          </ol>

          <div className="text-[11.5px] text-muted-2 leading-[1.55]">
            We store your API key encrypted at rest, and only ever use it to call <span className="font-mono">/wp-json/prodlyft/v1/*</span> on your site.
            Revoke or rotate from <span className="font-mono">Settings → Prodlyft Publisher</span> at any time.
          </div>
        </div>
      </div>
    </Shell>
  );
}
