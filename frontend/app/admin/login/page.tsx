"use client";
import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { BrandMark } from "@/components/BrandMark";
import { Icons } from "@/components/Icons";

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line">
        <Link href="/" className="flex items-center gap-2 font-semibold text-[15px] tracking-tight2">
          <BrandMark /> Prodlyft
        </Link>
        <div className="ml-3 chip font-mono">admin</div>
      </header>
      <div className="flex-1 grid place-items-center px-4 py-10">
        <Suspense fallback={<div className="text-muted text-sm">Loading…</div>}>
          <AdminLoginForm />
        </Suspense>
      </div>
    </div>
  );
}

function AdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
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
    // Verify the account has admin privileges. If not, sign the user out and
    // display an error — prevents non-admins from accidentally creating an
    // orphan admin session.
    const probe = await fetch("/api/admin/me");
    if (!probe.ok) {
      await signOut({ redirect: false });
      setErr("This account is not an admin.");
      setSubmitting(false);
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="w-full max-w-[400px]">
      <h1 className="text-[26px] md:text-[30px] tracking-tight2 font-[560] text-center mb-1.5">Admin sign in</h1>
      <p className="text-[13.5px] text-muted text-center mb-7">
        Staff access only. Regular users should <Link href="/signin" className="text-ink font-medium hover:underline">sign in here</Link>.
      </p>

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
          {submitting ? "Signing in…" : <>Enter admin <Icons.ArrowRight size={14} /></>}
        </button>
      </form>
    </div>
  );
}
