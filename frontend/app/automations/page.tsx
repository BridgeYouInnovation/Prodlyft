"use client";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { Icons } from "@/components/Icons";

const rules = [
  { name: "Auto-sync new imports → Shopify", on: true, trigger: "Import completes", actions: ["Push to acme.myshopify.com", "Tag: imported"], runs: 284 },
  { name: "Markup prices by 20%", on: true, trigger: "Any new product", actions: ["Multiply price × 1.20", "Round to .99"], runs: 412 },
  { name: "Rewrite titles with AI", on: true, trigger: "Import from third-party", actions: ["AI: rewrite title (brand-voice)", "Flag for review"], runs: 127 },
  { name: "Flag low-res images", on: false, trigger: "Image added", actions: ["If width < 1200px → flag"], runs: 0 },
];

export default function Automation() {
  return (
    <div className="min-h-screen flex">
      <Sidebar active="automations" />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar crumbs={["Acme Co.", "Automations"]} />
        <div className="flex-1 overflow-auto px-8 py-7 pb-12">
          <div className="flex items-start mb-6">
            <div>
              <h1 className="text-[22px]">Automations</h1>
              <p className="text-[13.5px] text-muted mt-1">Rules run on imports, edits, and sync events. When this → do that.</p>
            </div>
            <div className="flex-1" />
            <button className="btn">Browse templates</button>
            <button className="btn-primary ml-2"><Icons.Plus size={14}/> New automation</button>
          </div>

          <div className="card mb-8 overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2.5">
              <div className="text-[13px] font-medium">Rules</div>
              <span className="chip">{rules.length}</span>
              <div className="flex-1" />
              <button className="btn-sm btn-ghost"><Icons.Filter size={12}/> All</button>
            </div>
            <div className="border-t border-line">
              {rules.map((r, i) => (
                <div
                  key={i}
                  className={`grid items-center gap-3.5 px-4 py-3.5 ${i === rules.length - 1 ? "" : "border-b border-line-2"}`}
                  style={{ gridTemplateColumns: "44px 1fr 1.2fr 100px 80px 40px", background: i === 0 ? "var(--surface2)" : "transparent" }}
                >
                  <Toggle on={r.on} />
                  <div>
                    <div className="text-[13px] font-medium" style={{ color: r.on ? "var(--ink)" : "var(--muted)" }}>{r.name}</div>
                    <div className="text-[11.5px] text-muted mt-0.5 flex items-center gap-1.5">
                      <Icons.Bolt size={10} /> {r.trigger}
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    {r.actions.map((a, j) => (
                      <div key={j} className="text-[11.5px] text-muted flex items-center gap-1.5">
                        <Icons.Check size={10} className="text-muted-2" /> {a}
                      </div>
                    ))}
                  </div>
                  <div className="text-[11.5px] text-muted font-mono">{r.runs} runs</div>
                  <div className="flex items-center gap-1.5 text-[11.5px]" style={{ color: r.on ? "var(--accent-ink)" : "var(--muted-2)" }}>
                    <span className="dot" style={{ color: r.on ? "var(--accent)" : "var(--muted-2)" }} />
                    {r.on ? "Live" : "Paused"}
                  </div>
                  <Icons.Dots size={14} className="text-muted-2" />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
            <div className="card overflow-hidden">
              <div className="px-[18px] py-3.5 border-b border-line flex items-center">
                <div className="text-[13px] font-medium">Builder · Markup prices by 20%</div>
                <div className="flex-1" />
                <button className="btn-sm btn-ghost"><Icons.Play size={11}/> Test run</button>
                <button className="btn-sm btn-primary ml-1.5">Save</button>
              </div>
              <div className="p-[22px] flex flex-col gap-3.5">
                <Row label="WHEN">
                  <div className="flex-1 border border-line rounded-lg p-3.5">
                    <div className="text-[12px] text-muted mb-1.5">Trigger</div>
                    <div className="flex items-center gap-2">
                      <div className="w-[22px] h-[22px] rounded-md bg-ink text-bg grid place-items-center"><Icons.Bolt size={12}/></div>
                      <div className="text-[13px] font-medium">Any new product is imported</div>
                    </div>
                    <div className="mt-2.5 flex gap-1.5">
                      <span className="chip">Source: Any</span>
                      <span className="chip">Has variants: Any</span>
                    </div>
                  </div>
                </Row>
                <Row label="IF">
                  <div className="flex-1 rounded-lg p-3.5 bg-surface2" style={{ border: "1px dashed var(--line)" }}>
                    <div className="text-[12px] text-muted mb-1.5">Condition</div>
                    <div className="flex gap-1.5 items-center text-[12.5px]">
                      <span className="chip chip-ghost font-mono text-[11px]">product.cost</span>
                      <span className="text-muted">is greater than</span>
                      <span className="chip font-mono text-[11px]">$10.00</span>
                    </div>
                  </div>
                </Row>
                <Row label="THEN">
                  <div className="flex-1 flex flex-col gap-2.5">
                    {[
                      { t: "Multiply price × 1.20", sub: "Applies to variants" },
                      { t: "Round to .99", sub: "Nearest dollar" },
                    ].map((a, i) => (
                      <div key={i} className="border border-line rounded-lg p-3 flex items-center gap-2.5">
                        <div className="w-[22px] h-[22px] rounded-md grid place-items-center" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>
                          <Icons.Check size={12} stroke={2} />
                        </div>
                        <div className="flex-1">
                          <div className="text-[13px] font-medium">{a.t}</div>
                          <div className="text-[11.5px] text-muted">{a.sub}</div>
                        </div>
                        <Icons.Dots size={14} className="text-muted-2" />
                      </div>
                    ))}
                    <button className="btn-sm btn-ghost self-start"><Icons.Plus size={12}/> Add action</button>
                  </div>
                </Row>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="card overflow-hidden">
                <div className="px-3.5 py-3 text-[13px] font-medium border-b border-line flex items-center gap-2">
                  <Icons.Clock size={13}/> Recent runs
                </div>
                {[
                  { n: "Linen Apron — Natural", s: "ok", t: "2m" },
                  { n: "Brass Desk Lamp", s: "ok", t: "18m" },
                  { n: "Merino Crew — Oat", s: "skipped", t: "3h", reason: "cost < $10" },
                  { n: "Walnut Cutting Board", s: "ok", t: "5h" },
                  { n: "Ceramic Pour Over", s: "ok", t: "1d" },
                ].map((r, i) => (
                  <div key={i} className={`px-3.5 py-2.5 flex items-center gap-2.5 ${i === 4 ? "" : "border-b border-line-2"}`}>
                    <span className="dot" style={{ color: r.s === "ok" ? "var(--accent)" : "var(--muted-2)" }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-medium truncate">{r.n}</div>
                      <div className="text-[11px] text-muted">{r.s === "ok" ? "Price updated · +20%" : `Skipped — ${r.reason}`}</div>
                    </div>
                    <div className="font-mono text-[11px] text-muted">{r.t}</div>
                  </div>
                ))}
              </div>

              <div className="card p-3.5">
                <div className="text-[13px] font-medium mb-2.5">Templates</div>
                <div className="flex flex-col gap-1.5">
                  {[
                    "Auto-tag by keyword",
                    "Notify Slack on failed sync",
                    "Downsize images > 2MB",
                    "Translate descriptions · EN → FR",
                  ].map((t) => (
                    <div key={t} className="px-2.5 py-2 border border-line rounded-md text-[12.5px] flex items-center">
                      <Icons.Sparkle size={11} className="text-muted mr-2" />
                      <span className="flex-1">{t}</span>
                      <Icons.ArrowRight size={12} className="text-muted-2" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div
      className="w-[26px] h-[14px] rounded-full relative"
      style={{ background: on ? "var(--ink)" : "var(--line)" }}
    >
      <div
        className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white"
        style={{ left: on ? 14 : 2 }}
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-14 flex flex-col items-center pt-1">
        <div className="text-[10px] font-semibold font-mono text-muted tracking-wider">{label}</div>
        <div className="flex-1 w-px bg-line mt-2" />
      </div>
      {children}
    </div>
  );
}
