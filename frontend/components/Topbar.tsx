"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Icons } from "./Icons";

export function Topbar({
  crumbs,
  right,
  onMenuClick,
}: {
  crumbs: string[];
  right?: React.ReactNode;
  onMenuClick?: () => void;
}) {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const last = crumbs[crumbs.length - 1];
  const initials = (session?.user?.email || "?").slice(0, 1).toUpperCase();
  const isAdmin = (session?.user as { is_admin?: boolean } | undefined)?.is_admin;

  return (
    <div className="topbar px-3 md:px-5 gap-1 md:gap-2">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="btn-ghost btn-icon md:hidden mr-1 flex-shrink-0"
          aria-label="Open menu"
        >
          <Icons.Menu size={18} />
        </button>
      )}

      <div className="md:hidden text-[13px] font-medium text-ink truncate min-w-0">{last}</div>

      <div className="hidden md:flex items-center gap-2 text-[13px] min-w-0">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-2">
            <span className={i === crumbs.length - 1 ? "text-ink font-medium" : "text-muted"}>{c}</span>
            {i < crumbs.length - 1 && <Icons.Chevron size={12} className="text-muted-2" />}
          </span>
        ))}
      </div>

      <div className="flex-1" />

      {right ?? (
        <div ref={ref} className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="w-8 h-8 rounded-full flex-shrink-0 grid place-items-center text-white text-[12px] font-medium"
            style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}
            aria-label="Account"
          >
            {session?.user ? initials : "?"}
          </button>
          {menuOpen && session?.user && (
            <div
              className="absolute top-full right-0 mt-2 w-[220px] bg-white border border-line rounded-lg p-1.5 z-50"
              style={{ boxShadow: "0 20px 48px -20px rgba(14,14,12,0.25)" }}
            >
              <div className="px-2.5 py-2 border-b border-line-2 mb-1">
                <div className="text-[11.5px] text-muted">Signed in as</div>
                <div className="text-[13px] font-medium text-ink truncate">{session.user.email}</div>
              </div>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2 font-medium"
                  onClick={() => setMenuOpen(false)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Admin <span className="chip chip-accent text-[10px]">admin</span>
                  </span>
                </Link>
              )}
              <Link href="/dashboard" className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2" onClick={() => setMenuOpen(false)}>Dashboard</Link>
              <Link href="/products" className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2" onClick={() => setMenuOpen(false)}>Extracts</Link>
              <Link href="/" className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2" onClick={() => setMenuOpen(false)}>New extract</Link>
              <div className="my-1 border-t border-line-2" />
              <button
                onClick={() => signOut({ redirectTo: "/" })}
                className="block w-full text-left px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2 text-danger"
              >
                Sign out
              </button>
            </div>
          )}
          {menuOpen && !session?.user && (
            <div
              className="absolute top-full right-0 mt-2 w-[220px] bg-white border border-line rounded-lg p-3 z-50"
              style={{ boxShadow: "0 20px 48px -20px rgba(14,14,12,0.25)" }}
            >
              <Link href="/signin" className="btn-primary w-full justify-center">Sign in</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
