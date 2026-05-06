"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Icons } from "./Icons";
import { BrandMark } from "./BrandMark";

export type NavId = "dashboard" | "extracts" | "blogger" | "tickets" | "admin";

const items: { id: NavId; label: string; icon: keyof typeof Icons; href: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "Home", href: "/dashboard" },
  { id: "extracts", label: "Extracts", icon: "Box", href: "/products" },
  { id: "blogger", label: "Auto Blogger", icon: "Sparkle", href: "/blogger" },
  { id: "tickets", label: "Help", icon: "Bell", href: "/tickets" },
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
  const sessionUser = session?.user as { is_admin?: boolean } | undefined;
  const isAdmin = sessionUser?.is_admin;
  const email = session?.user?.email ?? "";
  const name = session?.user?.name;
  const display = name || email.split("@")[0] || "You";
  const initials = (name || email || "?").slice(0, 1).toUpperCase();

  // Live token balance — polled from /api/me. -1 means admin / unlimited.
  const [tokens, setTokens] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/me");
        if (!r.ok) return;
        const d = (await r.json()) as { tokens?: { balance?: number } };
        if (!alive) return;
        const bal = d.tokens?.balance;
        if (typeof bal === "number") setTokens(bal);
      } catch { /* ignore */ }
      try {
        const u = await fetch("/api/me/unread");
        if (!u.ok) return;
        const dd = (await u.json()) as { user_unread?: number };
        if (alive) setUnread(dd.user_unread || 0);
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
            const showBadge = i.id === "tickets" && unread > 0;
            return (
              <Link
                key={i.id}
                href={i.href}
                className={`nav-item ${active === i.id ? "active" : ""}`}
                onClick={onClose}
              >
                <Icon size={14} />
                <span className="flex-1">{i.label}</span>
                {showBadge && (
                  <span className="chip chip-warn text-[10px]" style={{ height: 16, padding: "0 6px" }}>
                    {unread}
                  </span>
                )}
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
            {/* Token balance mini-card */}
            <div className="border border-line bg-white rounded-lg p-2.5 mb-2">
              <div className="flex items-center gap-1.5 mb-1">
                <Icons.Sparkle
                  size={12}
                  className={
                    tokens === -1
                      ? "text-accent"
                      : tokens !== null && tokens === 0
                      ? "text-danger"
                      : tokens !== null && tokens < 10
                      ? "text-warn"
                      : "text-accent"
                  }
                />
                <span className="text-[11.5px] font-medium">Tokens</span>
              </div>
              {tokens === -1 ? (
                <div className="text-[10.5px] text-muted">Unlimited (admin)</div>
              ) : tokens === null ? (
                <div className="text-[10.5px] text-muted">…</div>
              ) : (
                <>
                  <div className="text-[18px] font-[560] tracking-tight2 leading-none mt-0.5">
                    {tokens.toLocaleString()}
                  </div>
                  <div className="text-[10.5px] text-muted mt-0.5 leading-snug">
                    {tokens === 0
                      ? "Out of tokens"
                      : tokens < 10
                      ? "Running low"
                      : "available"}
                  </div>
                </>
              )}
              {tokens !== -1 && (
                <Link
                  href="/pricing"
                  onClick={onClose}
                  className="block text-[10.5px] text-accent-ink hover:underline mt-1.5"
                >
                  Top up →
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
