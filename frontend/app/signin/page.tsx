"use client";
import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center" aria-label="Prodlyft home">
          <BrandMark />
        </Link>
      </header>
      <div className="flex-1 grid place-items-center px-4 py-10">
        <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl");
  const urlError = search.get("error");
  const verifiedFlag = search.get("verified");
  const verifiedEmail = search.get("email");
  const verifyReason = search.get("reason");
  const [email, setEmail] = useState(verifiedFlag === "1" ? (verifiedEmail || "") : "");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  // Distinct flag for the "needs verification" state so we render the
  // resend button alongside the message, not just a static error.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialise err from query string on first render. The link click
  // from email lands on /signin?verified=1 (or 0 + reason) — render the
  // appropriate banner.
  useState(() => {
    if (urlError === "CredentialsSignin") setErr("Wrong email or password.");
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function doResend(target: string) {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setResendMsg(null);
    try {
      const r = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target }),
      });
      const data = (await r.json()) as { ok: boolean; cooldown_seconds?: number; already_verified?: boolean; error?: string };
      if (data.already_verified) {
        setResendMsg("Your email is already verified — just sign in below.");
        setUnverifiedEmail(null);
      } else if (r.ok) {
        setResendMsg("Verification email sent. Check your inbox.");
        setResendCooldown(data.cooldown_seconds || 60);
      } else if (r.status === 429) {
        setResendMsg(`Please wait ${data.cooldown_seconds || 60}s before trying again.`);
        setResendCooldown(data.cooldown_seconds || 60);
      } else {
        setResendMsg(data.error || "Couldn't send the email.");
      }
    } catch (e) {
      setResendMsg((e as Error).message);
    } finally {
      setResending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setUnverifiedEmail(null);
    setResendMsg(null);
    setSubmitting(true);
    const trimmed = email.trim();
    const res = await signIn("credentials", {
      email: trimmed,
      password,
      redirect: false,
    });
    if (res?.error) {
      // Distinguish "wrong credentials" from "right credentials but
      // unverified" so we can offer Resend instead of a useless retry.
      // NextAuth wraps the thrown error string; the magic substring is
      // what we threw in auth.ts.
      if (res.error.includes("EmailNotVerified")) {
        setUnverifiedEmail(trimmed);
      } else {
        setErr("Wrong email or password.");
      }
      setSubmitting(false);
      return;
    }
    let target = callbackUrl;
    if (!target) {
      const me = await fetch("/api/auth/session").then((r) => r.ok ? r.json() : null).catch(() => null);
      target = me?.user?.is_admin ? "/admin" : "/dashboard";
    }
    router.push(target);
    router.refresh();
  }

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[26px] md:text-[30px] tracking-tight2 font-[560] text-center mb-1.5">Sign in to Prodlyft</h1>
      <p className="text-[13.5px] text-muted text-center mb-7">Welcome back.</p>

      {verifiedFlag === "1" && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]"
             style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
          Email verified — your 10 starter tokens are ready. Sign in below.
        </div>
      )}
      {verifiedFlag === "0" && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>
          {verifyReason === "expired" && "That verification link has expired or already been used. Request a new one below."}
          {verifyReason === "no_user" && "We couldn't find an account for that link."}
          {verifyReason === "missing" && "That verification link is missing the token."}
          {!verifyReason && "We couldn't verify that link."}
        </div>
      )}

      {err && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>
          {err}
        </div>
      )}

      {unverifiedEmail && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>
          <div className="font-medium mb-1.5">Your email isn&apos;t verified yet.</div>
          <div className="mb-2">
            We sent a verification link to <span className="font-mono">{unverifiedEmail}</span> when you signed up.
            Click the link in that email, then come back here to sign in.
          </div>
          <button
            type="button"
            onClick={() => doResend(unverifiedEmail)}
            disabled={resending || resendCooldown > 0}
            className="btn-sm"
          >
            {resending ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend verification email"}
          </button>
        </div>
      )}

      {resendMsg && !unverifiedEmail && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]"
             style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
          {resendMsg}
        </div>
      )}

      <form onSubmit={onSubmit} className="card p-5 flex flex-col gap-3">
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary btn-lg">
          {submitting ? "Signing in…" : <>Sign in <Icons.ArrowRight size={14} /></>}
        </button>
      </form>

      <div className="mt-6 text-center text-[13px] text-muted">
        New to Prodlyft?{" "}
        <Link
          href={callbackUrl ? `/signup?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/signup"}
          className="text-ink font-medium hover:underline"
        >
          Create an account
        </Link>
      </div>
    </div>
  );
}
