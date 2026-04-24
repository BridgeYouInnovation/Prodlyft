"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { Icons } from "./Icons";
import { BrandMark } from "./BrandMark";

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
  const isAdmin = (session?.user as { is_admin?: boolean } | undefined)?.is_admin;
  const email = session?.user?.email ?? "";
  const name = session?.user?.name;
  const display = name || email.split("@")[0] || "You";
  const initials = (name || email || "?").slice(0, 1).toUpperCase();

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
          <div className="font-semibold text-sm tracking-tight2">Prodlyft</div>
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
        )}
      </aside>
    </>
  );
}
