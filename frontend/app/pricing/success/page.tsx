"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LandingHeader } from "@/components/LandingHeader";
import { Icons } from "@/components/Icons";
import { operatorLabel } from "@/lib/mcp-shared";

type PaymentStatus = "created" | "pending" | "success" | "canceled" | "failed";

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-bg">
      <LandingHeader />
      <div className="px-4 py-10 md:py-16">
        <Suspense fallback={<div className="text-muted text-sm text-center">Loading…</div>}>
          <SuccessBody />
        </Suspense>
      </div>
    </div>
  );
}

function SuccessBody() {
  const search = useSearchParams();
  // MCP echoes any query params we passed on paylink creation into the
  // success URL. We include `app_ref` so we can look up the payment.
  const ref = search.get("app_ref");

  const [status, setStatus] = useState<PaymentStatus | "unknown">("unknown");
  const [packId, setPackId] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [tokensAdded, setTokensAdded] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  /** True after we've polled long enough that we should stop and let
   *  the user move on rather than spinning forever. */
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    if (!ref) { setStatus("unknown"); return; }
    let alive = true;
    let tries = 0;
    const MAX_TRIES = 90; // ~3 minutes at 2s intervals

    const tick = async () => {
      tries += 1;
      // Always keep polling on errors — never let a transient 4xx /
      // 5xx / network blip stop the loop. The page was getting stuck
      // on "Confirming…" forever because `if (!r.ok) return` exited
      // without scheduling another retry.
      let nextStatus: PaymentStatus | null = null;
      try {
        const r = await fetch(`/api/payment/${encodeURIComponent(ref)}`, {
          cache: "no-store",
        });
        if (r.ok) {
          const d = (await r.json()) as { status: PaymentStatus; plan: string; operator?: string | null };
          if (!alive) return;
          nextStatus = d.status;
          setStatus(d.status);
          setPackId(d.plan);
          if (d.operator) setOperator(d.operator);

          if (d.status === "success") {
            try {
              const [pr, mr] = await Promise.all([
                fetch("/api/packs").then((x) => x.json()),
                fetch("/api/me", { cache: "no-store" }).then((x) => x.json()),
              ]);
              const packs = (pr?.packs || []) as { id: string; tokens: number }[];
              const pack = packs.find((p) => p.id === d.plan);
              if (pack) setTokensAdded(pack.tokens);
              const tokens = mr?.tokens?.balance;
              if (typeof tokens === "number") setBalance(tokens);
            } catch { /* non-fatal */ }
          }
        }
      } catch { /* network blip, keep polling */ }

      // Terminal states stop the loop. Anything else schedules a retry
      // (including the case where r.ok was false — we'll just try again).
      const terminal = nextStatus === "success" || nextStatus === "failed" || nextStatus === "canceled";
      if (terminal || !alive) return;
      if (tries >= MAX_TRIES) {
        if (alive) setExhausted(true);
        return;
      }
      setTimeout(tick, 2000);
    };

    tick();
    return () => { alive = false; };
  }, [ref]);

  if (!ref) {
    return (
      <div className="max-w-[480px] mx-auto text-center">
        <div className="text-[20px] font-[560] tracking-tight2 mb-2">Payment received</div>
        <p className="text-[13.5px] text-muted mb-6">
          Thanks! If your token balance doesn't reflect the change in a minute, email{" "}
          <a className="underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a>.
        </p>
        <Link href="/dashboard" className="btn-primary btn-lg">Go to dashboard</Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="max-w-[480px] mx-auto text-center">
        <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-5" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
          <Icons.Check size={22} />
        </div>
        <div className="text-[22px] md:text-[26px] font-[560] tracking-tight2 mb-2">
          {tokensAdded ? `+${tokensAdded.toLocaleString()} tokens added.` : "Tokens added."}
        </div>
        <p className="text-[13.5px] text-muted mb-2">
          Your purchase is confirmed{packId ? ` (${packId} pack)` : ""}
          {operator ? ` · paid via ${operatorLabel(operator)}` : ""}.
        </p>
        {balance !== null && balance >= 0 && (
          <p className="text-[13.5px] text-muted mb-6">
            New balance: <span className="text-ink font-medium">{balance.toLocaleString()} tokens</span>
          </p>
        )}
        <Link href="/dashboard" className="btn-primary btn-lg">Go to dashboard <Icons.ArrowRight size={14}/></Link>
      </div>
    );
  }

  if (status === "failed" || status === "canceled") {
    return (
      <div className="max-w-[480px] mx-auto text-center">
        <div className="text-[20px] font-[560] tracking-tight2 mb-2">Payment didn't complete</div>
        <p className="text-[13.5px] text-muted mb-6">Try again from the pricing page or contact support if you were charged.</p>
        <Link href="/pricing" className="btn-primary btn-lg">Back to pricing</Link>
      </div>
    );
  }

  // Pending / unknown state. Show the spinner with an escape hatch so
  // the user is never trapped here. If polling exhausted, switch to a
  // "can't confirm but check your dashboard" message — by this point
  // any successful payment has already credited tokens server-side, so
  // /dashboard is the source of truth.
  return (
    <div className="max-w-[480px] mx-auto text-center">
      {exhausted ? (
        <>
          <div className="text-[20px] font-[560] tracking-tight2 mb-2">
            Still confirming…
          </div>
          <p className="text-[13.5px] text-muted mb-4 leading-[1.55]">
            Your payment may already be complete — check your token balance on
            the dashboard. If it&apos;s missing in a few minutes, email{" "}
            <a className="underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a>{" "}
            with reference{" "}
            <span className="font-mono text-ink">{ref}</span>.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/dashboard" className="btn-primary btn-lg">
              Go to dashboard <Icons.ArrowRight size={14} />
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-lg"
            >
              Check again
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="inline-flex items-center gap-2 text-[14px] font-medium mb-2">
            <span className="w-4 h-4 rounded-full spin-border" style={{ border: "1.5px solid var(--ink)", borderRightColor: "transparent" }} />
            Confirming your payment…
          </div>
          <p className="text-[12.5px] text-muted mb-5">
            This usually takes a few seconds.
          </p>
          <Link href="/dashboard" className="btn">
            Skip to dashboard
          </Link>
        </>
      )}
    </div>
  );
}
