"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { LandingHeader } from "@/components/LandingHeader";
import { Icons } from "@/components/Icons";

interface ThemeDetail {
  slug: string;
  name: string;
  author: string | null;
  author_uri: string | null;
  theme_uri: string | null;
  version: string | null;
  description: string | null;
  license: string | null;
  tags: string | null;
  template: string | null;
  style_url: string | null;
}

interface DetectResult {
  url: string;
  wordpress: boolean;
  signals: string[];
  version: string | null;
  theme: ThemeDetail | null;
  plugins: { slug: string; name: string }[];
  message?: string;
}

export default function WpDetectorPage() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!url.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/tools/wp-detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await r.json()) as DetectResult & { error?: string };
      if (!r.ok) {
        throw new Error(data.error || `HTTP ${r.status}`);
      }
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />

      <section className="pt-12 md:pt-[72px] px-4 md:px-12 max-w-[900px] mx-auto">
        <div className="text-center mb-8 md:mb-10">
          <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-line rounded-full text-[11.5px] text-ink-2 mb-5">
            <span className="chip chip-accent h-[18px]">Free tool</span>
            No login required
          </div>
          <h1 className="text-[32px] sm:text-[42px] md:text-[52px] font-[560] leading-[1.05] tracking-tight3 mb-3 md:mb-4 px-2 sm:px-0">
            WordPress Theme &amp;<br className="hidden sm:inline" />
            <span className="text-muted"> Plugin Detector</span>
          </h1>
          <p className="text-[14px] md:text-[16px] text-muted max-w-[560px] mx-auto leading-[1.55] px-2 sm:px-0">
            Paste any URL — we'll tell you what WordPress theme it's running, the WordPress version, and every plugin we can find from the page source.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="max-w-[640px] mx-auto bg-white border border-line rounded-xl p-2 flex flex-col sm:flex-row sm:items-center gap-2"
          style={{ boxShadow: "0 1px 2px rgba(14,14,12,0.04), 0 12px 40px -20px rgba(14,14,12,0.15)" }}
        >
          <div className="flex items-center gap-2 px-3 sm:border-r border-line text-muted h-10 sm:h-11">
            <Icons.Link size={15} />
            <span className="font-mono text-[12px]">https://</span>
          </div>
          <input
            className="flex-1 font-mono text-[13.5px] text-ink text-left bg-transparent outline-none px-3 sm:px-0 min-w-0"
            placeholder="example.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <button type="submit" disabled={submitting} className="btn-primary btn-lg w-full sm:w-auto" style={{ height: 44 }}>
            {submitting ? "Detecting…" : <>Detect <Icons.ArrowRight size={14} /></>}
          </button>
        </form>

        {error && (
          <div className="mt-4 mx-auto max-w-[640px] p-3 rounded-md text-[13px] bg-warn-soft text-warn-ink text-center">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-8 md:mt-10 grid gap-4">
            {/* Top summary */}
            <div className="card p-5">
              <div className="flex items-start gap-3 flex-wrap">
                <div
                  className="w-12 h-12 rounded-full grid place-items-center flex-shrink-0"
                  style={{
                    background: result.wordpress ? "var(--accent-soft)" : "var(--line-2)",
                    color: result.wordpress ? "var(--accent-ink)" : "var(--muted)",
                  }}
                >
                  {result.wordpress ? <Icons.Check size={24} stroke={2.5} /> : <Icons.X size={24} stroke={2.5} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[18px] font-[560] tracking-tight2">
                    {result.wordpress ? "WordPress detected" : "Not WordPress"}
                  </div>
                  <div className="font-mono text-[12px] text-muted break-all">{result.url}</div>
                </div>
                {result.version && (
                  <div className="text-right">
                    <div className="text-[11.5px] text-muted">WP version</div>
                    <div className="font-mono text-[15px] font-medium">{result.version}</div>
                  </div>
                )}
              </div>
              {result.message && (
                <div className="mt-3 text-[13px] text-muted">{result.message}</div>
              )}
              {result.signals.length > 0 && (
                <div className="mt-3 text-[11.5px] text-muted-2">
                  Detected via: {result.signals.join(", ")}.
                </div>
              )}
            </div>

            {/* Theme */}
            {result.theme && (
              <div className="card p-5">
                <div className="text-[11.5px] text-muted uppercase tracking-wider mb-2">Theme</div>
                <div className="flex items-start gap-3 flex-wrap mb-3">
                  <div className="text-[22px] font-[560] tracking-tight2 flex-1 min-w-0 break-words">
                    {result.theme.name}
                  </div>
                  {result.theme.version && (
                    <span className="chip">v{result.theme.version}</span>
                  )}
                </div>
                {result.theme.description && (
                  <p className="text-[13px] text-ink-2 leading-[1.55] mb-3">{result.theme.description}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[12.5px]">
                  <Field label="Slug" value={<span className="font-mono">{result.theme.slug}</span>} />
                  <Field
                    label="Author"
                    value={
                      result.theme.author_uri ? (
                        <a className="text-ink hover:underline" href={result.theme.author_uri} target="_blank" rel="noopener noreferrer">
                          {result.theme.author || result.theme.author_uri}
                        </a>
                      ) : (
                        result.theme.author || "—"
                      )
                    }
                  />
                  <Field
                    label="Theme URL"
                    value={
                      result.theme.theme_uri ? (
                        <a className="text-ink hover:underline break-all" href={result.theme.theme_uri} target="_blank" rel="noopener noreferrer">
                          {result.theme.theme_uri}
                        </a>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Field label="License" value={result.theme.license || "—"} />
                  {result.theme.template && (
                    <Field
                      label="Parent theme"
                      value={<span className="font-mono">{result.theme.template}</span>}
                    />
                  )}
                  {result.theme.tags && (
                    <Field label="Tags" value={<span className="text-muted">{result.theme.tags}</span>} />
                  )}
                </div>
              </div>
            )}

            {result.wordpress && !result.theme && (
              <div className="card p-5 text-center text-[13px] text-muted">
                Couldn't pinpoint the theme — the site may obfuscate its <span className="font-mono">/wp-content/themes/</span> paths.
              </div>
            )}

            {/* Plugins */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="text-[11.5px] text-muted uppercase tracking-wider">Plugins detected</div>
                <span className="chip">{result.plugins.length}</span>
              </div>
              {result.plugins.length === 0 ? (
                <div className="text-[13px] text-muted">
                  No plugin paths visible in the page source. The site may not use any front-end plugins, or they may be loaded from elsewhere.
                </div>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.plugins.map((p) => (
                    <li key={p.slug} className="flex items-center gap-2 text-[13px] py-1">
                      <Icons.Plug size={13} className="text-muted flex-shrink-0" />
                      <span className="text-ink">{p.name}</span>
                      <span className="font-mono text-[11px] text-muted-2 truncate">{p.slug}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* CTA */}
            <div className="card p-5 text-center">
              <div className="text-[14px] font-[560] mb-1.5">Need to migrate the catalog too?</div>
              <p className="text-[13px] text-muted mb-4 max-w-[480px] mx-auto leading-[1.55]">
                Prodlyft pulls every product from a Shopify or WooCommerce store and exports a clean CSV — try it free.
              </p>
              <Link href="/" className="btn-primary btn-lg">
                Try Prodlyft <Icons.ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}

        <div className="mt-12 md:mt-16 grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
          {[
            { n: "01", t: "Paste any URL", d: "Public WordPress sites only — we read the page source over a normal HTTP request." },
            { n: "02", t: "We scan the markup", d: "Stylesheet hrefs, plugin script paths, generator meta tags, and the WP REST API hint all give us tells." },
            { n: "03", t: "Get name, author, version", d: "When the theme exposes its style.css we pull the full author, version, license and description from the file header." },
          ].map((s) => (
            <div key={s.n} className="card p-5">
              <div className="font-mono text-[11px] text-muted mb-2">{s.n}</div>
              <div className="text-[15px] font-[560] tracking-tight2 mb-1.5">{s.t}</div>
              <div className="text-[13px] text-muted leading-[1.55]">{s.d}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 mb-16 text-center text-[12px] text-muted-2 max-w-[560px] mx-auto leading-[1.55]">
          Detection is best-effort — a small percentage of sites obfuscate their theme/plugin paths or load them from a CDN we can't trace. If results look wrong, the source code probably hides them.
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-muted uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
