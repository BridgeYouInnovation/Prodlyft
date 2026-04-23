"use client";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[15px] tracking-tight2">
          <BrandMark /> Prodlyft
        </Link>
      </header>
      <div className="flex-1 grid place-items-center px-4 py-10">
        <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}>
          <SignUpForm />
        </Suspense>
      </div>
    </div>
  );
}

function SignUpForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/dashboard";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);

    if (password.length < 8) {
      setErr("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() || undefined }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setErr(body.error || "Signup failed. Try again.");
        setSubmitting(false);
        return;
      }
      const res = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (res?.error) {
        setErr("Account created but sign-in failed. Try logging in.");
        setSubmitting(false);
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[26px] md:text-[30px] tracking-tight2 font-[560] text-center mb-1.5">Create your account</h1>
      <p className="text-[13.5px] text-muted text-center mb-7">Free. No credit card required.</p>

      {err && (
        <div className="mb-5 p-3 rounded-md text-[12.5px]" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)" }}>
          {err}
        </div>
      )}

      <form onSubmit={onSubmit} className="card p-5 flex flex-col gap-3">
        <div>
          <label className="label">Name <span className="text-muted-2 font-normal">(optional)</span></label>
          <input
            className="input"
            type="text"
            placeholder="Sam"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
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
          />
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            placeholder="At least 8 characters"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={submitting} className="btn-primary btn-lg">
          {submitting ? "Creating account…" : <>Create account <Icons.ArrowRight size={14} /></>}
        </button>
        <div className="text-[11.5px] text-muted-2 text-center leading-[1.55]">
          By continuing you agree to Prodlyft's Terms and acknowledge the Privacy Policy.
        </div>
      </form>

      <div className="mt-6 text-center text-[13px] text-muted">
        Already have an account?{" "}
        <Link
          href={`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="text-ink font-medium hover:underline"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
