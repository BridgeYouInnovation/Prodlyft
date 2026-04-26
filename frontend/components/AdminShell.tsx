"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { BrandMark } from "./BrandMark";
import { Icons } from "./Icons";

const nav = [
  { id: "overview", label: "Overview", icon: "Home" as const, href: "/admin" },
  { id: "users", label: "Users", icon: "Box" as const, href: "/admin/users" },
  { id: "extracts", label: "Extracts", icon: "Import" as const, href: "/admin/extracts" },
  { id: "blogger", label: "Auto Blogger", icon: "Sparkle" as const, href: "/admin/blogger" },
  { id: "tickets", label: "Tickets", icon: "Bell" as const, href: "/admin/tickets" },
  { id: "configs", label: "AI configs", icon: "Sparkle" as const, href: "/admin/configs" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [adminUnread, setAdminUnread] = useState(0);

  const email = session?.user?.email ?? "";
  const initials = (email || "?").slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!session?.user) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/me/unread");
        if (!r.ok) return;
        const d = (await r.json()) as { admin_unread?: number };
        if (alive) setAdminUnread(d.admin_unread || 0);
      } catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [session?.user]);

  return (
    <div className="min-h-screen flex">
      {open && <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setOpen(false)} />}
      <aside
        className={`
          w-[240px] border-r border-line flex flex-col flex-shrink-0 py-3.5 px-2.5
          fixed inset-y-0 left-0 z-50 transition-transform
          md:static md:translate-x-0
          ${open ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ backgroundColor: "#0E0E0C" }}
      >
        <div className="flex items-center gap-2 px-2 pb-4 pt-1">
          <BrandMark light />
          <div className="text-[10.5px] font-mono text-white/50 uppercase tracking-wider">Admin</div>
          <div className="flex-1" />
          <button
            onClick={() => setOpen(false)}
            className="md:hidden text-white/70 hover:text-white"
            aria-label="Close"
          >
            <Icons.X size={16} />
          </button>
        </div>

        <nav className="flex flex-col gap-px mt-2">
          {nav.map((i) => {
            const Icon = Icons[i.icon];
            const active = i.id === "overview" ? path === "/admin" : path?.startsWith(i.href);
            const showBadge = i.id === "tickets" && adminUnread > 0;
            return (
              <Link
                key={i.id}
                href={i.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 h-9 px-2.5 rounded-md text-[13px]"
                style={{
                  background: active ? "rgba(255,255,255,0.09)" : "transparent",
                  color: active ? "#fff" : "rgba(255,255,255,0.7)",
                  fontWeight: active ? 500 : 400,
                }}
              >
                <Icon size={14} />
                <span className="flex-1">{i.label}</span>
                {showBadge && (
                  <span
                    className="text-[10px] font-medium px-1.5 rounded"
                    style={{ background: "var(--accent)", color: "white", minWidth: 18, textAlign: "center" }}
                  >
                    {adminUnread}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="border border-white/10 bg-white/5 rounded-lg p-2.5 text-white/80">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full grid place-items-center text-white text-[11px] font-medium"
                 style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11.5px] truncate">{email}</div>
              <div className="text-[10px] text-white/50">Admin</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ redirectTo: "/admin/login" })}
            className="w-full text-[12px] py-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="topbar px-3 md:px-5 gap-1">
          <button
            onClick={() => setOpen(true)}
            className="btn-ghost btn-icon md:hidden mr-1 flex-shrink-0"
          >
            <Icons.Menu size={18} />
          </button>
          <div className="text-[13px] font-medium text-ink">Admin</div>
          <div className="flex-1" />
          <Link href="/" className="btn-sm btn-ghost">Exit admin</Link>
        </div>
        {children}
      </div>
    </div>
  );
}
