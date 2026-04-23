"use client";
import Link from "next/link";
import { Icons } from "./Icons";
import { BrandMark } from "./BrandMark";

type NavId = "dashboard" | "imports" | "products" | "automations" | "integrations" | "settings";

const items: { id: NavId; label: string; icon: keyof typeof Icons; href: string; badge?: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "Home", href: "/dashboard" },
  { id: "imports", label: "Imports", icon: "Import", href: "/imports/new", badge: "12" },
  { id: "products", label: "Products", icon: "Box", href: "/products" },
  { id: "automations", label: "Automations", icon: "Bolt", href: "/automations" },
  { id: "integrations", label: "Integrations", icon: "Plug", href: "/integrations" },
];

export function Sidebar({ active }: { active: NavId }) {
  return (
    <aside
      className="w-[220px] border-r border-line flex flex-col flex-shrink-0 py-3.5 px-2.5"
      style={{ background: "var(--sidebar,#F6F4EC)", backgroundColor: "#F6F4EC" }}
    >
      <div className="flex items-center gap-2 px-2 pb-4 pt-1">
        <BrandMark />
        <div className="font-semibold text-sm tracking-tight2">Prodlyft</div>
        <div className="flex-1" />
        <div className="font-mono text-[10.5px] text-muted px-1.5 py-0.5 border border-line rounded bg-white">
          ⌘K
        </div>
      </div>

      <div className="px-2 pb-2.5">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-white border border-line rounded-md text-[12px] text-ink-2 cursor-pointer">
          <div className="w-4 h-4 rounded bg-ink text-bg grid place-items-center text-[9px] font-semibold">AC</div>
          <span className="flex-1 truncate">Acme Co.</span>
          <Icons.ChevronDown size={12} />
        </div>
      </div>

      <nav className="flex flex-col gap-px">
        {items.map((i) => {
          const Icon = Icons[i.icon];
          return (
            <Link key={i.id} href={i.href} className={`nav-item ${active === i.id ? "active" : ""}`}>
              <Icon size={14} />
              <span className="flex-1">{i.label}</span>
              {i.badge && <span className="text-[10.5px] text-muted font-mono">{i.badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="nav-section">Workspace</div>
      <nav className="flex flex-col gap-px">
        <Link href="/settings" className={`nav-item ${active === "settings" ? "active" : ""}`}>
          <Icons.Settings size={14} />
          <span>Settings</span>
        </Link>
        <div className="nav-item">
          <Icons.Plug size={14} />
          <span className="flex-1">Shopify</span>
          <span className="dot text-accent" />
        </div>
        <div className="nav-item">
          <div className="w-3.5 h-3.5 grid place-items-center">
            <div className="w-2 h-2 rounded-sm" style={{ background: "#7F54B3" }} />
          </div>
          <span className="flex-1">WooCommerce</span>
          <span className="dot text-accent" />
        </div>
      </nav>

      <div className="flex-1" />

      <div className="border border-line bg-white rounded-lg p-2.5">
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium mb-1">
          <Icons.Sparkle size={12} className="text-accent" />
          Plan · Starter
        </div>
        <div className="text-[11px] text-muted leading-snug">412 / 1,000 imports used this month</div>
        <div className="h-[3px] bg-line-2 rounded-full mt-2 overflow-hidden">
          <div className="h-full bg-ink" style={{ width: "41%" }} />
        </div>
      </div>
    </aside>
  );
}
