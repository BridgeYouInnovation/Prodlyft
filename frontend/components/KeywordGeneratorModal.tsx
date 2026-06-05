"use client";
import { useEffect, useRef, useState } from "react";
import { Icons } from "./Icons";

interface Props {
  /** WP connection id to research against. If null/empty the modal
   *  refuses to open — caller should disable the trigger button. */
  connectionId: string;
  /** Pretty label for the site (used in the modal headline). */
  siteLabel?: string;
  /** Called with the chosen keywords when the user clicks "Use these". */
  onUse: (keywords: string[]) => void;
  /** Called when the user dismisses without picking. */
  onClose: () => void;
}

interface ApiResult {
  keywords: string[];
  seeds: string[];
  pool_size: number;
  site_title: string;
  duration_ms: number;
}

const COUNT_PRESETS = [10, 20, 30, 50];

/**
 * Keyword research modal. Two-phase UX:
 *
 *   Phase 1 — "How many keywords do you want?" + Generate button.
 *   Phase 2 — Spinner while we hit /api/blogger/keywords/generate.
 *   Phase 3 — Results list; user can untick individual keywords or
 *             regenerate before committing.
 *
 * The "Use these" button hands the final list back to the parent form.
 */
export function KeywordGeneratorModal({ connectionId, siteLabel, onUse, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState<number>(20);
  const [phase, setPhase] = useState<"setup" | "loading" | "results">("setup");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);

  // Close on Escape + click-outside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Defer click listener so the click that opened the modal doesn't
    // immediately close it.
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 50);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
      window.removeEventListener("mousedown", onClick);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  async function generate() {
    if (!connectionId) return;
    setErr(null);
    setPhase("loading");
    try {
      const r = await fetch("/api/blogger/keywords/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id: connectionId, count }),
      });
      const data = (await r.json()) as ApiResult & { error?: string };
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setResult(data);
      setSelected(new Set(data.keywords));
      setPhase("results");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("setup");
    }
  }

  function toggle(kw: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(14,14,12,0.45)" }}
      role="dialog"
      aria-label="Generate keywords"
    >
      <div
        ref={panelRef}
        className="bg-white border border-line rounded-xl w-full max-w-[540px] max-h-[calc(100vh-48px)] flex flex-col overflow-hidden"
        style={{ boxShadow: "0 32px 80px -24px rgba(14,14,12,0.4)" }}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-line-2 flex items-center gap-2">
          <Icons.Sparkle size={16} className="text-accent" />
          <div className="flex-1">
            <div className="text-[14px] font-medium">Generate keywords</div>
            {siteLabel && (
              <div className="text-[11.5px] text-muted truncate">For {siteLabel}</div>
            )}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
            <Icons.X size={16} />
          </button>
        </div>

        {/* Setup phase */}
        {phase === "setup" && (
          <div className="p-5 overflow-y-auto">
            <p className="text-[13px] text-muted leading-[1.55] mb-4">
              We&apos;ll analyse your site, identify your niche, then surface real keywords
              people are searching on Google. Edit the list before using it.
            </p>

            <label className="label">How many keywords?</label>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {COUNT_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={`px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${
                    count === n
                      ? "bg-ink text-white border-ink"
                      : "bg-white border-line hover:border-ink-2"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={5}
              max={50}
              value={count}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) setCount(Math.max(5, Math.min(50, v)));
              }}
              className="input mb-4"
            />

            {err && (
              <div className="p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink mb-3">
                {err}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="btn">Cancel</button>
              <button onClick={generate} className="btn-primary btn-lg">
                <Icons.Sparkle size={13} /> Generate
              </button>
            </div>
            <div className="text-[11px] text-muted-2 mt-3 leading-[1.5]">
              Takes ~5 seconds. Uses Google&apos;s public autocomplete to pull queries
              people are actually typing — no SEO subscription required.
            </div>
          </div>
        )}

        {/* Loading phase */}
        {phase === "loading" && (
          <div className="p-10 text-center">
            <div className="inline-flex flex-col items-center gap-3">
              <div
                className="rounded-full"
                style={{
                  width: 36,
                  height: 36,
                  border: "2px solid var(--line-2)",
                  borderTopColor: "var(--ink)",
                  animation: "spin-border 0.9s linear infinite",
                }}
              />
              <div className="text-[13px] font-medium">Researching your site…</div>
              <div className="text-[12px] text-muted max-w-[300px] leading-[1.55]">
                Reading your homepage → finding your niche → expanding seeds on Google
                Suggest → ranking the best matches.
              </div>
            </div>
          </div>
        )}

        {/* Results phase */}
        {phase === "results" && result && (
          <>
            <div className="px-5 py-3 border-b border-line-2 text-[11.5px] text-muted flex items-center gap-3 flex-wrap">
              <span><span className="text-ink font-medium">{selected.size}</span> of {result.keywords.length} selected</span>
              <span>·</span>
              <span>From {result.pool_size.toLocaleString()} Google Suggest queries</span>
              <span>·</span>
              <span>{(result.duration_ms / 1000).toFixed(1)}s</span>
            </div>

            <div className="overflow-y-auto px-5 py-3 flex-1">
              {result.seeds.length > 0 && (
                <div className="mb-3 text-[11px] text-muted-2">
                  Derived from seeds:{" "}
                  {result.seeds.map((s, i) => (
                    <span key={s}>
                      <span className="text-muted">{s}</span>
                      {i < result.seeds.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-1">
                {result.keywords.map((kw) => {
                  const isOn = selected.has(kw);
                  return (
                    <button
                      key={kw}
                      type="button"
                      onClick={() => toggle(kw)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-md border text-left transition-colors"
                      style={{
                        borderColor: isOn ? "var(--ink)" : "var(--line-2)",
                        background: isOn ? "var(--surface2)" : "transparent",
                      }}
                    >
                      <div
                        className="rounded-sm grid place-items-center flex-shrink-0"
                        style={{
                          width: 16,
                          height: 16,
                          background: isOn ? "var(--ink)" : "transparent",
                          border: isOn ? "1px solid var(--ink)" : "1px solid var(--muted-2)",
                          color: "#fff",
                        }}
                      >
                        {isOn && <Icons.Check size={11} />}
                      </div>
                      <span className="text-[13px]">{kw}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-line-2 flex items-center gap-2">
              <button
                onClick={() => setPhase("setup")}
                className="btn-sm btn-ghost"
              >
                <Icons.ChevronLeft size={12} /> Regenerate
              </button>
              <div className="flex-1" />
              <button onClick={onClose} className="btn-sm">Cancel</button>
              <button
                onClick={() => onUse(Array.from(selected))}
                disabled={selected.size === 0}
                className="btn-primary"
              >
                Use {selected.size} keyword{selected.size === 1 ? "" : "s"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
