// Plan limits and pricing — must match backend/app/plans.py for enforcement
// numbers, and the frontend display needs its own copy for the pricing page
// and the sidebar chip.

export const FREE_LIFETIME_CAP = 5;        // total products across all extracts
export const PRO_PERIOD_CAP = 10_000;      // products per rolling 30-day period
export const PERIOD_DAYS = 30;

export type Currency = "XAF" | "NGN" | "USD";

export function currencyFromCountry(country: string | null | undefined): Currency {
  const c = (country || "").toUpperCase();
  if (c === "CM") return "XAF";
  if (c === "NG") return "NGN";
  return "USD";
}

export interface PricePoint {
  /** integer amount in the smallest conventional unit for display (XAF/NGN are whole units, USD dollars). */
  amount: number;
  /** Period in human form ("/ month"). Null for one-time / free. */
  period?: string;
}

export interface PlanDef {
  id: "free" | "pro" | "unlimited";
  name: string;
  tagline: string;
  limitLabel: string;
  features: string[];
  ctaLabel: string;
  highlight?: boolean;
  prices: Record<Currency, PricePoint>;
}

export const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Kick the tires.",
    limitLabel: "5 products total, lifetime",
    features: [
      "Any Shopify or WooCommerce store",
      "Shopify CSV + WooCommerce CSV export",
      "Max-products and category filters",
      "Community support",
    ],
    ctaLabel: "Start free",
    prices: {
      XAF: { amount: 0 },
      NGN: { amount: 0 },
      USD: { amount: 0 },
    },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For a real catalog migration.",
    limitLabel: "10,000 products per 30-day cycle",
    features: [
      "Everything in Free",
      "10,000 products every 30 days",
      "AI config caching across domains",
      "Priority email support",
    ],
    ctaLabel: "Upgrade to Pro",
    highlight: true,
    prices: {
      XAF: { amount: 10_000, period: "/ month" },
      NGN: { amount: 25_000, period: "/ month" },
      USD: { amount: 19,     period: "/ month" },
    },
  },
  {
    id: "unlimited",
    name: "Unlimited",
    tagline: "Agencies and power users.",
    limitLabel: "No product caps",
    features: [
      "Everything in Pro",
      "Unlimited products",
      "Concurrent extracts",
      "Direct Slack channel with the team",
    ],
    ctaLabel: "Go Unlimited",
    prices: {
      XAF: { amount: 25_000, period: "/ month" },
      NGN: { amount: 65_000, period: "/ month" },
      USD: { amount: 49,     period: "/ month" },
    },
  },
];

export function formatPrice(p: PricePoint, currency: Currency): string {
  if (!p.amount) return "0";
  if (currency === "USD") return `$${p.amount.toLocaleString()}`;
  // XAF and NGN: whole units, symbol after the number
  const sym = currency === "XAF" ? "FCFA" : "₦";
  const amt = p.amount.toLocaleString();
  return currency === "NGN" ? `${sym}${amt}` : `${amt} ${sym}`;
}

export function planLabel(plan: string | null | undefined): string {
  const p = (plan || "free").toLowerCase();
  if (p === "pro") return "Pro";
  if (p === "unlimited") return "Unlimited";
  return "Free";
}
