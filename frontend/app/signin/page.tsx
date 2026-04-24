"use client";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(
    urlError === "CredentialsSignin" ? "Wrong email or password." : null,
  );
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    const res = await signIn("credentials", {
      email: email.trim(),
      password,
      redirect: false,
    });
    if (res?.error) {
      setErr("Wrong email or password.");
      setSubmitting(false);
      return;
    }
    // If no explicit callback was passed, route admins to /admin and
    // regular users to /dashboard.
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

      {err && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>
          {err}
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
