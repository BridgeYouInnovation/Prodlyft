"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { BrandMark } from "./BrandMark";
import { Icons } from "./Icons";

const tools = [
  { name: "Product Catalog Extractor", desc: "Pull full Shopify & WooCommerce catalogs.", href: "/", live: true },
  { name: "WP Theme Detector", desc: "Detect the theme and plugins behind any WordPress site.", href: "/tools/wp-detector", live: true },
  { name: "Store Platform Checker", desc: "Identify whether a URL runs Shopify, Woo, or something else.", href: "#", live: false },
  { name: "Currency Converter", desc: "Live FX rates between any pair.", href: "#", live: false },
];

export function LandingHeader() {
  const { data: session, status } = useSession();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const toolsRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) setToolsOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  const initials = (session?.user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <header className="h-[60px] px-4 md:px-12 flex items-center border-b border-line relative">
      <Link href="/" className="flex items-center" aria-label="Prodlyft home">
        <BrandMark />
      </Link>

      {/* Desktop nav */}
      <nav className="hidden lg:flex items-center gap-5 ml-10 text-[13px] text-muted">
        <div ref={toolsRef} className="relative">
          <button
            onClick={() => setToolsOpen((o) => !o)}
            className="flex items-center gap-1 hover:text-ink transition-colors"
          >
            Tools <Icons.ChevronDown size={12} />
          </button>
          {toolsOpen && (
            <div
              className="absolute top-full left-0 mt-2 w-[360px] bg-white border border-line rounded-lg p-2 z-50"
              style={{ boxShadow: "0 20px 48px -20px rgba(14,14,12,0.25)" }}
            >
              {tools.map((t) => (
                <Link
                  key={t.name}
                  href={t.href}
                  onClick={() => setToolsOpen(false)}
                  className={`block px-3 py-2.5 rounded-md hover:bg-line-2 ${t.live ? "" : "pointer-events-none opacity-60"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-[13px] font-medium text-ink">{t.name}</div>
                    {!t.live && <span className="chip chip-ghost text-[10px]">Soon</span>}
                  </div>
                  <div className="text-[11.5px] text-muted mt-0.5">{t.desc}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <Link href="/pricing" className="hover:text-ink transition-colors">Pricing</Link>
        <Link href="#docs" className="hover:text-ink transition-colors">Docs</Link>
        <Link href="#changelog" className="hover:text-ink transition-colors">Changelog</Link>
      </nav>

      <div className="flex-1" />

      {/* Right side: auth aware */}
      {status === "loading" ? (
        <div className="w-8 h-8 rounded-full bg-line-2" />
      ) : session?.user ? (
        <div ref={userRef} className="relative flex items-center gap-2">
          <Link href="/dashboard" className="btn hidden sm:inline-flex">Dashboard</Link>
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            className="w-8 h-8 rounded-full grid place-items-center text-white text-[12px] font-medium flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #A8B5A0, #6A7A6C)" }}
            aria-label="Account"
          >
            {initials}
          </button>
          {userMenuOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-[220px] bg-white border border-line rounded-lg p-1.5 z-50"
              style={{ boxShadow: "0 20px 48px -20px rgba(14,14,12,0.25)" }}
            >
              <div className="px-2.5 py-2 border-b border-line-2 mb-1">
                <div className="text-[11.5px] text-muted">Signed in as</div>
                <div className="text-[13px] font-medium text-ink truncate">{session.user.email}</div>
              </div>
              {(session.user as { is_admin?: boolean }).is_admin && (
                <Link
                  href="/admin"
                  className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2 font-medium"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <span className="inline-flex items-center gap-1.5">
                    Admin dashboard <span className="chip chip-accent text-[10px]">admin</span>
                  </span>
                </Link>
              )}
              <Link href="/dashboard" className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2" onClick={() => setUserMenuOpen(false)}>Dashboard</Link>
              <Link href="/products" className="block px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2" onClick={() => setUserMenuOpen(false)}>Extracts</Link>
              <div className="my-1 border-t border-line-2" />
              <button
                onClick={() => signOut({ redirectTo: "/" })}
                className="block w-full text-left px-2.5 py-2 rounded-md text-[13px] hover:bg-line-2 text-danger"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-[13px]">
          <Link href="/signin" className="text-muted hover:text-ink hidden sm:inline">Sign in</Link>
          <Link href="/signup" className="btn-primary">Start free</Link>
        </div>
      )}

      {/* Mobile menu button */}
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="btn-ghost btn-icon lg:hidden ml-1"
        aria-label="Menu"
      >
        <Icons.Menu size={18} />
      </button>

      {/* Mobile menu sheet */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[60px] bottom-0 bg-black/40 z-40" onClick={() => setMenuOpen(false)}>
          <div className="bg-white mx-4 mt-3 rounded-lg p-4 border border-line" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] font-mono text-muted uppercase tracking-wider mb-2">Tools</div>
            {tools.map((t) => (
              <Link
                key={t.name}
                href={t.href}
                onClick={() => setMenuOpen(false)}
                className={`block py-2 text-[13px] ${t.live ? "text-ink" : "text-muted-2 pointer-events-none"}`}
              >
                {t.name} {!t.live && <span className="chip chip-ghost text-[10px] ml-1">Soon</span>}
              </Link>
            ))}
            <div className="my-3 border-t border-line-2" />
            <Link href="/pricing" onClick={() => setMenuOpen(false)} className="block py-2 text-[13px] text-ink">Pricing</Link>
            <Link href="#docs" onClick={() => setMenuOpen(false)} className="block py-2 text-[13px] text-ink">Docs</Link>
            <Link href="#changelog" onClick={() => setMenuOpen(false)} className="block py-2 text-[13px] text-ink">Changelog</Link>
          </div>
        </div>
      )}
    </header>
  );
}
