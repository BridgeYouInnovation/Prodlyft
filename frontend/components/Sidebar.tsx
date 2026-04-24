"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Icons } from "./Icons";
import { BrandMark } from "./BrandMark";
import { FREE_LIFETIME_CAP, PRO_PERIOD_CAP, planLabel } from "@/lib/plans";

export type NavId = "dashboard" | "extracts" | "admin";

const items: { id: NavId; label: string; icon: keyof typeof Icons; href: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "Home", href: "/dashboard" },
  { id: "extracts", label: "Extracts", icon: "Box", href: "/products" },
];

export function Sidebar({
  active,
  open = false,
  onClose,
}: {
  active: NavId;
  open?: boolean;
  onClose?: () => void;
}) {
  const { data: session } = useSession();
  const sessionUser = session?.user as { is_admin?: boolean; plan?: string } | undefined;
  const isAdmin = sessionUser?.is_admin;
  const plan = (sessionUser?.plan || "free").toLowerCase();
  const email = session?.user?.email ?? "";
  const name = session?.user?.name;
  const display = name || email.split("@")[0] || "You";
  const initials = (name || email || "?").slice(0, 1).toUpperCase();

  // Live usage — session.plan is static at login, usage changes as crawls
  // complete, so we fetch and poll /api/me while the sidebar is mounted.
  const [usage, setUsage] = useState<{ used: number; cap: number | null; remaining: number | null } | null>(null);
  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/me");
        if (!r.ok) return;
        const d = (await r.json()) as {
          plan?: string;
          products_used_in_period?: number;
          products_used_total?: number;
          remaining?: number | null;
        };
        if (!alive) return;
        const p = (d.plan || "free").toLowerCase();
        const used =
          p === "pro" ? d.products_used_in_period ?? 0 : d.products_used_total ?? 0;
        const cap = p === "unlimited" ? null : p === "pro" ? PRO_PERIOD_CAP : FREE_LIFETIME_CAP;
        setUsage({ used, cap, remaining: d.remaining ?? null });
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [session?.user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={`
          w-[260px] md:w-[220px] border-r border-line flex flex-col flex-shrink-0 py-3.5 px-2.5
          fixed inset-y-0 left-0 z-50 transition-transform
          md:static md:translate-x-0 md:h-auto
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ backgroundColor: "#F6F4EC" }}
      >
        <div className="flex items-center gap-2 px-2 pb-4 pt-1">
          <BrandMark />
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="md:hidden btn-ghost btn-icon -mr-1"
            aria-label="Close menu"
          >
            <Icons.X size={16} />
          </button>
        </div>

        <nav className="flex flex-col gap-px mt-1">
          {items.map((i) => {
            const Icon = Icons[i.icon];
            return (
              <Link
                key={i.id}
                href={i.href}
                className={`nav-item ${active === i.id ? "active" : ""}`}
                onClick={onClose}
              >
                <Icon size={14} />
                <span className="flex-1">{i.label}</span>
              </Link>
            );
          })}
          <Link
            href="/"
            className="nav-item"
            onClick={onClose}
          >
            <Icons.Plus size={14} />
            <span className="flex-1">New extract</span>
          </Link>
        </nav>

        {isAdmin && (
          <>
            <div className="nav-section">Staff</div>
            <Link
              href="/admin"
              className="nav-item"
              onClick={onClose}
            >
              <Icons.Sparkle size={14} />
              <span className="flex-1">Admin</span>
              <span className="chip chip-accent text-[10px]">admin</span>
            </Link>
          </>
        )}

        <div className="flex-1" />

        {session?.user && (
          <>
            {/* Plan + usage mini-card */}
            <div className="border border-line bg-white rounded-lg p-2.5 mb-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Icons.Sparkle size={12} className={plan === "free" ? "text-muted" : "text-accent"} />
                <span className="text-[11.5px] font-medium">Plan · {planLabel(plan)}</span>
              </div>
              {usage && usage.cap !== null ? (
                <>
                  <div className="text-[10.5px] text-muted leading-snug">
                    {usage.used} / {usage.cap.toLocaleString()} product{usage.cap === 1 ? "" : "s"}
                    {plan === "pro" ? " this period" : " used"}
                  </div>
                  <div className="h-[3px] bg-line-2 rounded-full mt-1.5 overflow-hidden">
                    <div
                      className="h-full transition-[width]"
                      style={{
                        width: `${Math.min(100, (usage.used / usage.cap) * 100)}%`,
                        background:
                          usage.remaining === 0
                            ? "var(--danger)"
                            : usage.remaining && usage.remaining < usage.cap * 0.2
                            ? "var(--warn)"
                            : "var(--ink)",
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className="text-[10.5px] text-muted">Unlimited extracts</div>
              )}
              {plan !== "unlimited" && (
                <Link href="/pricing" onClick={onClose} className="block text-[10.5px] text-accent-ink hover:underline mt-1.5">
                  {plan === "free" ? "Upgrade →" : "Upgrade to Unlimited →"}
                </Link>
              )}
            </div>

            <div className="border border-line bg-white rounded-lg p-2.5">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-medium flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium truncate">{display}</div>
                  <div className="text-[10.5px] text-muted truncate">{email}</div>
                </div>
              </div>
              <button
                onClick={() => signOut({ redirectTo: "/" })}
                className="w-full text-[11.5px] py-1.5 rounded-md border border-line hover:bg-line-2 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
