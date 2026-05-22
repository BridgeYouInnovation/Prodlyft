"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center" aria-label="Prodlyft home">
          <BrandMark />
        </Link>
      </header>
      <div className="flex-1 grid place-items-center px-4 py-10">
        <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}>
          <VerifyEmailCard />
        </Suspense>
      </div>
    </div>
  );
}

function VerifyEmailCard() {
  const search = useSearchParams();
  const email = search.get("email") || "";
  const emailFailed = search.get("email_failed") === "1";

  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Tick the cooldown timer down so the button label shows live progress.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function resend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    setMsg(null);
    try {
      const r = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await r.json()) as { ok: boolean; cooldown_seconds?: number; already_verified?: boolean; error?: string };
      if (data.already_verified) {
        setMsg({ kind: "ok", text: "This email is already verified. You can sign in." });
      } else if (r.ok) {
        setMsg({ kind: "ok", text: "Verification email sent. Check your inbox (and spam folder)." });
        setCooldown(data.cooldown_seconds || 60);
      } else if (r.status === 429) {
        setMsg({ kind: "err", text: `Please wait ${data.cooldown_seconds || 60}s before requesting another email.` });
        setCooldown(data.cooldown_seconds || 60);
      } else {
        setMsg({ kind: "err", text: data.error || "Couldn't send the email — try again in a moment." });
      }
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="w-full max-w-[440px] text-center">
      <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-5"
           style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
        <Icons.Bell size={22} />
      </div>
      <h1 className="text-[24px] md:text-[28px] font-[560] tracking-tight2 mb-2">
        Check your inbox
      </h1>
      <p className="text-[13.5px] text-muted mb-6 leading-[1.55]">
        We sent a verification link to{" "}
        <span className="text-ink font-medium font-mono">{email || "your email"}</span>.
        Click it to confirm your account and unlock your 10 starter tokens.
      </p>

      {emailFailed && (
        <div className="mb-4 p-3 rounded-md text-[12.5px] bg-warn-soft text-warn-ink">
          The email might have failed to send. Hit Resend below — if it keeps failing,
          email <a className="underline" href="mailto:prodlyft@gmail.com">prodlyft@gmail.com</a> and we&apos;ll verify you manually.
        </div>
      )}

      {msg && (
        <div className={`mb-4 p-3 rounded-md text-[12.5px] ${
          msg.kind === "ok" ? "bg-accent-soft text-accent-ink" : "bg-warn-soft text-warn-ink"
        }`}>
          {msg.text}
        </div>
      )}

      <button
        type="button"
        onClick={resend}
        disabled={resending || cooldown > 0}
        className="btn btn-lg w-full justify-center"
      >
        {resending
          ? "Sending…"
          : cooldown > 0
          ? `Resend in ${cooldown}s`
          : "Resend verification email"}
      </button>

      <div className="text-[12.5px] text-muted mt-5">
        Wrong email? <Link href="/signup" className="text-ink hover:underline">Start over</Link>
        {" · "}
        Already verified? <Link href="/signin" className="text-ink hover:underline">Sign in</Link>
      </div>

      <div className="text-[11px] text-muted-2 mt-8 leading-[1.6]">
        The link expires in 24 hours. Check your spam folder if you don&apos;t see it —
        sender is <span className="font-mono">prodlyft@gmail.com</span>.
      </div>
    </div>
  );
}
