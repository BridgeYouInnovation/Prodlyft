"use client";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[15px] tracking-tight2">
          <BrandMark /> Prodlyft
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
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/dashboard";
  const err = search.get("error");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await signIn("resend", { email: email.trim(), redirectTo: callbackUrl });
    setSubmitting(false);
  }

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[26px] md:text-[30px] tracking-tight2 font-[560] text-center mb-1.5">Sign in to Prodlyft</h1>
      <p className="text-[13.5px] text-muted text-center mb-7">
        We'll send a magic link to your inbox. No password needed.
      </p>

      {err && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>
          {err === "Verification" ? "That link is invalid or expired. Request a new one below." : "Something went wrong. Try again."}
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
        <button type="submit" disabled={submitting} className="btn-primary btn-lg">
          {submitting ? "Sending link…" : <>Email me a sign-in link <Icons.ArrowRight size={14} /></>}
        </button>
        <div className="text-[11.5px] text-muted-2 text-center leading-[1.55]">
          By continuing you agree to Prodlyft's Terms and acknowledge the Privacy Policy.
        </div>
      </form>

      <div className="mt-6 text-center text-[12.5px] text-muted">
        New here? Enter your email — we'll create your account on the first sign-in.
      </div>
    </div>
  );
}
