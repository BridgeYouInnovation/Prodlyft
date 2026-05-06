"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { LandingHeader } from "@/components/LandingHeader";
import { Icons } from "@/components/Icons";
import {
  COUNTRY_OPTIONS,
  currencyFromCountry,
  type Currency,
} from "@/lib/plans";

interface Pack {
  id: string;
  name: string;
  tokens: number;
  price_xaf: number;
  price_usd_cents: number;
  price_ngn: number;
  highlight: boolean;
  sort_order: number;
}

const PREF_KEY = "prodlyft_country";

function priceLabel(p: Pack, currency: Currency): string {
  if (currency === "USD") return `$${(p.price_usd_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (currency === "NGN") return `₦${p.price_ngn.toLocaleString()}`;
  return `${p.price_xaf.toLocaleString()} FCFA`;
}

function perTokenLabel(p: Pack, currency: Currency): string {
  if (currency === "USD") return `$${(p.price_usd_cents / 100 / p.tokens).toFixed(3)} / token`;
  if (currency === "NGN") return `₦${(p.price_ngn / p.tokens).toFixed(1)} / token`;
  return `${(p.price_xaf / p.tokens).toFixed(1)} FCFA / token`;
}

export default function PricingPage() {
  const router = useRouter();
  const { status: authStatus } = useSession();
  const [packs, setPacks] = useState<Pack[]>([]);
  const [country, setCountry] = useState<string | null>(null);
  const [detected, setDetected] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load packs from /api/packs.
  useEffect(() => {
    fetch("/api/packs")
      .then((r) => (r.ok ? r.json() : { packs: [] }))
      .then((d: { packs?: Pack[] }) => setPacks(d.packs || []))
      .catch(() => setPacks([]));
  }, []);

  async function startCheckout(packId: string) {
    setCheckoutError(null);
    if (authStatus !== "authenticated") {
      router.push(`/signin?callbackUrl=${encodeURIComponent("/pricing")}`);
      return;
    }
    setCheckoutPending(packId);
    try {
      const r = await fetch("/api/payment/paylink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });
      const data = (await r.json()) as { payment_url?: string; error?: string };
      if (!r.ok || !data.payment_url) {
        throw new Error(data.error || `Checkout failed: ${r.status}`);
      }
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

  // Resolve country / currency: localStorage → /api/geo → "WW" fallback.
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
    try { localStorage.setItem(PREF_KEY, code); } catch { /* ignore */ }
    setMenuOpen(false);
  }

  function resetToDetected() {
    try { localStorage.removeItem(PREF_KEY); } catch { /* ignore */ }
    setCountry(detected);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />

      <section className="pt-12 md:pt-[72px] px-4 md:px-12 max-w-[1180px] mx-auto">
        <div className="text-center mb-10 md:mb-14">
          <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 bg-white border border-line rounded-full text-[11.5px] text-ink-2 mb-5">
            <span className="chip chip-accent h-[18px]">Tokens</span>
            Prices shown in <span className="font-mono font-medium">{currency}</span>
          </div>
          <h1 className="text-[32px] sm:text-[44px] md:text-[52px] font-[560] leading-[1.05] tracking-tight3 mb-3 md:mb-4">
            Buy tokens.<br className="hidden sm:inline" />
            <span className="text-muted"> Spend them how you want.</span>
          </h1>
          <p className="text-[14px] md:text-[16px] text-muted max-w-[560px] mx-auto leading-[1.55] mb-5">
            One balance, every tool. Tokens never expire. Stop worrying about monthly resets.
          </p>

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

        {/* Cost-per-action callout */}
        <div className="mx-auto max-w-[860px] mb-10 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Product extracted", cost: "1 token" },
            { label: "Blog post — no image", cost: "5 tokens" },
            { label: "Blog post + AI image", cost: "10 tokens" },
          ].map((x) => (
            <div key={x.label} className="card p-4 text-center">
              <div className="text-[12.5px] text-muted">{x.label}</div>
              <div className="text-[16px] font-[560] mt-0.5">{x.cost}</div>
            </div>
          ))}
        </div>

        {/* Pack cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {packs.map((p) => (
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
              <div className="text-[13px] text-muted mb-5">
                {p.tokens.toLocaleString()} tokens
              </div>

              <div className="flex items-baseline gap-1.5 mb-1">
                <div className="text-[34px] md:text-[38px] font-[560] tracking-tight3 leading-none">
                  {priceLabel(p, currency)}
                </div>
              </div>
              <div className="text-[12px] text-muted-2 mb-5">{perTokenLabel(p, currency)}</div>

              <ul className="flex flex-col gap-1.5 mb-6 text-[12.5px] text-muted">
                <li className="flex items-start gap-1.5">
                  <Icons.Check size={13} className="text-accent flex-shrink-0 mt-[3px]" />
                  <span><span className="text-ink">{p.tokens.toLocaleString()}</span> products extracted</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Icons.Check size={13} className="text-accent flex-shrink-0 mt-[3px]" />
                  <span><span className="text-ink">{Math.floor(p.tokens / 5).toLocaleString()}</span> blog posts (no image)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Icons.Check size={13} className="text-accent flex-shrink-0 mt-[3px]" />
                  <span><span className="text-ink">{Math.floor(p.tokens / 10).toLocaleString()}</span> blog posts (+ AI image)</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <Icons.Check size={13} className="text-accent flex-shrink-0 mt-[3px]" />
                  <span>Tokens never expire</span>
                </li>
              </ul>

              <div className="flex-1" />

              <button
                type="button"
                onClick={() => startCheckout(p.id)}
                disabled={checkoutPending === p.id}
                className={p.highlight ? "btn-primary btn-lg justify-center" : "btn btn-lg justify-center"}
              >
                {checkoutPending === p.id ? "Redirecting…" : <>Buy {p.name} <Icons.ArrowRight size={14} /></>}
              </button>
              {currency !== "XAF" && (
                <div className="text-[11px] text-muted-2 text-center mt-2">
                  Charged as {p.price_xaf.toLocaleString()} FCFA via My-CoolPay
                </div>
              )}
            </div>
          ))}
          {packs.length === 0 && (
            <div className="col-span-full text-center text-muted text-[13px] py-10">Loading packs…</div>
          )}
        </div>

        {checkoutError && (
          <div className="mt-4 p-3 rounded-md text-[12.5px] max-w-[480px] mx-auto bg-warn-soft text-warn-ink text-center">
            {checkoutError}
          </div>
        )}

        <div className="mt-10 text-center text-[12.5px] text-muted">
          One-time purchases via <span className="font-medium text-ink">My-CoolPay</span> — mobile money (Orange Money, MTN MoMo) or card.
          Need an invoice or refund? Email{" "}
          <a className="text-ink font-medium hover:underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a>.
        </div>

        <div className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
          {[
            { q: "Do tokens expire?", a: "Never. Buy a pack today, spend it next year — no monthly resets, no clawbacks." },
            { q: "What if my extract runs out mid-job?", a: "We stop saving more products and keep what we already saved. Top up and start a new extract for the rest." },
            { q: "Can I get a refund on unused tokens?", a: "Email us within 14 days of purchase if you haven't used the tokens. We'll refund the unused portion to your original payment method." },
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
