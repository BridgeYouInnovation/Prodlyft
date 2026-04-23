"use client";
import { Shell } from "@/components/Shell";
import { Icons } from "@/components/Icons";

const connected = [
  { name: "acme.myshopify.com", type: "Shopify", color: "#95BF47", since: "Mar 14", products: 842, status: "healthy" },
  { name: "wp.acmehome.com", type: "WooCommerce", color: "#7F54B3", since: "Feb 02", products: 416, status: "healthy" },
  { name: "staging.myshopify.com", type: "Shopify", color: "#95BF47", since: "Apr 08", products: 26, status: "warning" },
];
const available = [
  { name: "Shopify", desc: "Sync products, variants, collections, and inventory.", color: "#95BF47", tag: "Storefront" },
  { name: "WooCommerce", desc: "REST API push with variations and metadata.", color: "#7F54B3", tag: "Storefront" },
  { name: "BigCommerce", desc: "Push to BigCommerce catalog.", color: "#34313F", tag: "Storefront", soon: true },
  { name: "Squarespace", desc: "Publish to Squarespace Commerce.", color: "#000", tag: "Storefront", soon: true },
  { name: "Slack", desc: "Notify channels on sync events.", color: "#4A154B", tag: "Notifications" },
  { name: "Zapier", desc: "Trigger Zaps from any import event.", color: "#FF4A00", tag: "Automation" },
  { name: "Webhooks", desc: "Post JSON to any URL on events.", color: "#0E0E0C", tag: "Developer" },
  { name: "Google Drive", desc: "Backup image assets.", color: "#1A73E8", tag: "Storage" },
];

export default function Integrations() {
  return (
    <Shell active="integrations" crumbs={["Acme Co.", "Integrations"]}>
      <div className="flex-1 overflow-auto px-4 md:px-8 py-5 md:py-7 pb-12">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-6">
          <div>
            <h1 className="text-[20px] md:text-[22px]">Integrations</h1>
            <p className="text-[13.5px] text-muted mt-1">Connect the stores and services Prodlyft pushes to.</p>
          </div>
          <div className="sm:flex-1" />
          <button className="btn self-start sm:self-auto"><Icons.Plus size={14}/> Add connection</button>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[13.5px]">Connected</h2>
          <span className="chip">{connected.length}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-9">
          {connected.map((c, i) => (
            <div key={i} className="card p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-md relative flex-shrink-0" style={{ background: c.color, opacity: 0.15 }}>
                  <div className="absolute inset-1.5 rounded-sm" style={{ background: c.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{c.name}</div>
                  <div className="text-[11.5px] text-muted">{c.type} · since {c.since}</div>
                </div>
                <Icons.Dots size={14} className="text-muted-2" />
              </div>
              <div className="h-px bg-line-2 my-3.5" />
              <div className="flex text-[12px] items-center">
                <div className="flex-1">
                  <div className="text-muted text-[11px]">Synced</div>
                  <div className="font-medium mt-0.5">{c.products}</div>
                </div>
                <div className="flex-1">
                  <div className="text-muted text-[11px]">Status</div>
                  <div className="flex items-center gap-1.5 mt-0.5 text-[11.5px]">
                    <span className="dot" style={{ color: c.status === "healthy" ? "var(--accent)" : "oklch(0.65 0.13 70)" }} />
                    {c.status === "healthy" ? "Healthy" : "Scope warning"}
                  </div>
                </div>
                <button className="btn-sm btn-ghost">Manage</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[13.5px]">Available</h2>
          </div>
          <div className="sm:flex-1" />
          <div className="flex gap-1.5 text-[12px] overflow-x-auto pb-1 -mx-1 px-1">
            {["All", "Storefront", "Automation", "Notifications", "Developer"].map((t, i) => (
              <div
                key={t}
                className="px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0"
                style={{
                  background: i === 0 ? "var(--ink)" : "white",
                  color: i === 0 ? "var(--bg)" : "var(--muted)",
                  border: i === 0 ? "none" : "1px solid var(--line)",
                  fontWeight: i === 0 ? 500 : 400,
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {available.map((a, i) => (
            <div key={i} className="card p-3.5" style={{ opacity: a.soon ? 0.7 : 1 }}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-[26px] h-[26px] rounded-md relative flex-shrink-0" style={{ background: a.color, opacity: 0.15 }}>
                  <div className="absolute inset-[5px] rounded-sm" style={{ background: a.color }} />
                </div>
                <div className="text-[13px] font-medium flex-1">{a.name}</div>
                {a.soon && <span className="chip chip-ghost text-[10px]">Soon</span>}
              </div>
              <div className="text-[11.5px] text-muted leading-[1.5] min-h-8">{a.desc}</div>
              <div className="flex items-center mt-3">
                <span className="chip text-[10px]">{a.tag}</span>
                <div className="flex-1" />
                <button className="btn-sm" disabled={a.soon} style={{ opacity: a.soon ? 0.5 : 1 }}>
                  Connect <Icons.ArrowRight size={11}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
