"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LandingHeader } from "@/components/LandingHeader";
import { Icons } from "@/components/Icons";

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

  useEffect(() => {
    if (!ref) { setStatus("unknown"); return; }
    let alive = true;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const r = await fetch(`/api/payment/${encodeURIComponent(ref)}`);
        if (!r.ok) return;
        const d = (await r.json()) as { status: PaymentStatus; plan: string };
        if (!alive) return;
        setStatus(d.status);
        setPackId(d.plan);

        if (d.status === "success") {
          // Surface "+N tokens" + new balance on the success card.
          try {
            const [pr, mr] = await Promise.all([
              fetch("/api/packs").then((x) => x.json()),
              fetch("/api/me").then((x) => x.json()),
            ]);
            const packs = (pr?.packs || []) as { id: string; tokens: number }[];
            const pack = packs.find((p) => p.id === d.plan);
            if (pack) setTokensAdded(pack.tokens);
            const tokens = mr?.tokens?.balance;
            if (typeof tokens === "number") setBalance(tokens);
          } catch { /* non-fatal */ }
        }

        if (d.status !== "success" && d.status !== "failed" && d.status !== "canceled" && tries < 30) {
          setTimeout(tick, 2000);
        }
      } catch { /* ignore */ }
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
          Your purchase is confirmed{packId ? ` (${packId} pack)` : ""}.
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

  return (
    <div className="max-w-[480px] mx-auto text-center">
      <div className="inline-flex items-center gap-2 text-[14px] font-medium mb-2">
        <span className="w-4 h-4 rounded-full spin-border" style={{ border: "1.5px solid var(--ink)", borderRightColor: "transparent" }} />
        Confirming your payment…
      </div>
      <p className="text-[12.5px] text-muted">This usually takes a few seconds.</p>
    </div>
  );
}
