"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LandingHeader } from "@/components/LandingHeader";
import { Icons } from "@/components/Icons";
import {
  PLANS,
  COUNTRY_OPTIONS,
  currencyFromCountry,
  formatPrice,
  type Currency,
} from "@/lib/plans";

const PREF_KEY = "prodlyft_country";
// My-CoolPay always charges in XAF — display currency is informational.
const MCP_XAF: Record<"pro" | "unlimited", number> = { pro: 10_000, unlimited: 25_000 };

export default function PricingPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [country, setCountry] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  async function startCheckout(plan: "pro" | "unlimited") {
    setCheckoutError(null);
    if (authStatus !== "authenticated") {
      router.push(`/signin?callbackUrl=${encodeURIComponent("/pricing")}`);
      return;
    }
    setCheckoutPending(plan);
    try {
      const r = await fetch("/api/payment/paylink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await r.json()) as { payment_url?: string; error?: string };
      if (!r.ok || !data.payment_url) {
        throw new Error(data.error || `Checkout failed: ${r.status}`);
      }
      // Redirect the browser to My-CoolPay's hosted checkout.
      window.location.href = data.payment_url;
    } catch (e) {
      setCheckoutError((e as Error).message);
      setCheckoutPending(null);
    }
  }

  // Close the country menu on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Initial resolution:
  //   1. Saved preference in localStorage (user-chosen)
  //   2. Server-detected country from Vercel geo header
  //   3. Fallback: "WW" (International / USD)
  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(PREF_KEY) : null;
    if (saved) {
      setCountry(saved);
      return;
    }
    fetch("/api/geo")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const c = (d?.country as string | null) || "WW";
        // Narrow to one of our known options; else "WW"
        const known = COUNTRY_OPTIONS.find((o) => o.code === c);
        const resolved = known ? known.code : "WW";
        setDetected(resolved);
        setCountry(resolved);
      })
      .catch(() => {
        setDetected("WW");
        setCountry("WW");
      });
  }, []);

  const currency: Currency = useMemo(() => {
    if (!country) return "USD";
    const opt = COUNTRY_OPTIONS.find((o) => o.code === country);
    return opt?.currency ?? currencyFromCountry(country);
  }, [country]);

  const selected = COUNTRY_OPTIONS.find((o) => o.code === country) ?? COUNTRY_OPTIONS[COUNTRY_OPTIONS.length - 1];
  const isUserOverride = detected !== null && country !== null && country !== detected;

  function choose(code: string) {
    setCountry(code);
    try {
      localStorage.setItem(PREF_KEY, code);
    } catch {
      /* ignore */
    }
    setMenuOpen(false);
  }

  function resetToDetected() {
    try {
      localStorage.removeItem(PREF_KEY);
    } catch { /* ignore */ }
    setCountry(detected);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />

      <section className="pt-12 md:pt-[72px] px-4 md:px-12 max-w-[1100px] mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-line rounded-full text-[11.5px] text-ink-2 mb-5">
            <span className="chip chip-accent h-[18px]">Pricing</span>
            Prices shown in{" "}
            <span className="font-mono font-medium">{currency}</span>
          </div>
          <h1 className="text-[32px] sm:text-[44px] md:text-[52px] font-[560] leading-[1.05] tracking-tight3 mb-3 md:mb-4">
            Simple pricing.<br className="hidden sm:inline" />
            <span className="text-muted"> Scale as you grow.</span>
          </h1>
          <p className="text-[14px] md:text-[16px] text-muted max-w-[520px] mx-auto leading-[1.55] mb-5">
            Start free, upgrade when you need more. Cancel any time.
          </p>

          {/* Country / currency selector */}
          <div className="inline-flex items-center gap-2 text-[12.5px]">
            <span className="text-muted">Showing prices for</span>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-line rounded-md hover:border-ink transition-colors"
              >
                <Icons.Globe size={12} />
                <span className="font-medium text-ink">{selected.name}</span>
                <span className="text-muted-2 font-mono text-[11px]">· {selected.currency}</span>
                <Icons.ChevronDown size={11} className="text-muted-2" />
              </button>
              {menuOpen && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[240px] bg-white border border-line rounded-lg p-1.5 z-50 text-left"
                  style={{ boxShadow: "0 20px 48px -20px rgba(14,14,12,0.25)" }}
                >
                  {COUNTRY_OPTIONS.map((c) => {
                    const isActive = c.code === country;
                    const isDetected = c.code === detected;
                    return (
                      <button
                        key={c.code}
                        onClick={() => choose(c.code)}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md hover:bg-line-2 text-[13px]"
                        style={{ background: isActive ? "var(--line-2)" : undefined }}
                      >
                        <span className="flex-1 text-ink">{c.name}</span>
                        <span className="font-mono text-[11px] text-muted">{c.currency}</span>
                        {isDetected && <span className="chip chip-accent text-[9px]">detected</span>}
                      </button>
                    );
                  })}
                  {isUserOverride && (
                    <>
                      <div className="my-1 border-t border-line-2" />
                      <button
                        onClick={resetToDetected}
                        className="w-full text-left px-2.5 py-2 rounded-md text-[12px] text-muted hover:bg-line-2"
                      >
                        Reset to detected ({detected})
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {PLANS.map((p) => {
            const price = p.prices[currency];
            const isFree = p.id === "free";
            return (
              <div
                key={p.id}
                className="card p-6 flex flex-col relative"
                style={{
                  borderColor: p.highlight ? "var(--ink)" : "var(--line)",
                  boxShadow: p.highlight ? "0 8px 32px -12px rgba(14,14,12,0.16)" : undefined,
                }}
              >
                {p.highlight && (
                  <span className="absolute -top-2.5 left-6 chip chip-accent">Most popular</span>
                )}
                <div className="text-[13px] font-medium text-muted mb-1">{p.name}</div>
                <div className="text-[13px] text-muted mb-5">{p.tagline}</div>

                <div className="flex items-baseline gap-1.5 mb-1">
                  <div className="text-[40px] md:text-[44px] font-[560] tracking-tight3 leading-none">
                    {isFree ? "Free" : formatPrice(price, currency)}
                  </div>
                  {!isFree && <div className="text-[13px] text-muted">/ month</div>}
                </div>
                <div className="text-[12.5px] text-muted mb-6">{p.limitLabel}</div>

                <ul className="flex flex-col gap-2 mb-6">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]">
                      <Icons.Check size={14} className="text-accent flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex-1" />

                {isFree ? (
                  <Link href="/signup" className="btn btn-lg justify-center">Start free</Link>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => startCheckout(p.id as "pro" | "unlimited")}
                      disabled={checkoutPending === p.id}
                      className={p.highlight ? "btn-primary btn-lg justify-center" : "btn btn-lg justify-center"}
                    >
                      {checkoutPending === p.id ? "Redirecting…" : <>{p.ctaLabel} <Icons.ArrowRight size={14} /></>}
                    </button>
                    {currency !== "XAF" && (
                      <div className="text-[11px] text-muted-2 text-center mt-2">
                        Charged as {MCP_XAF[p.id as "pro" | "unlimited"].toLocaleString()} FCFA via My-CoolPay
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {checkoutError && (
          <div className="mt-4 p-3 rounded-md text-[12.5px] max-w-[480px] mx-auto bg-warn-soft text-warn-ink text-center">
            {checkoutError}
          </div>
        )}

        <div className="mt-10 text-center text-[12.5px] text-muted">
          Paid plans billed monthly via{" "}
          <span className="font-medium text-ink">My-CoolPay</span> — mobile money (Orange Money, MTN MoMo) or card.
          Cancel any time: email{" "}
          <a className="text-ink font-medium hover:underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a>.
        </div>

        <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
          {[
            { q: "What counts as a product?", a: "Every product row we save from your extracts — whether from a Shopify /products.json, a WooCommerce store API, or a single product page scraped by the AI." },
            { q: "How does the 30-day Pro cycle work?", a: "It's a rolling window — each period starts when you first use it and resets 30 days later. You get a fresh 10,000 products each time." },
            { q: "Can I cancel or downgrade?", a: "Yes. Email us and we'll downgrade at the end of your current period so you keep what you paid for." },
          ].map((x) => (
            <div key={x.q} className="card p-5">
              <div className="text-[14px] font-[560] mb-1.5">{x.q}</div>
              <div className="text-[13px] text-muted leading-[1.55]">{x.a}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="h-20" />
    </div>
  );
}
