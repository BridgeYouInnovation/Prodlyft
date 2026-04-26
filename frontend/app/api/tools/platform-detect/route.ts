import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36 ProdlyftBot/1.0";

// ---------- Helpers ----------

function normalizeUrl(input: string): string | null {
  const t = (input || "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchOnce(url: string, timeoutMs = 15_000) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: r.ok, status: r.status, text: await r.text(), headers: r.headers };
  } catch {
    return { ok: false, status: 0, text: "", headers: new Headers() };
  }
}

// ---------- Platform rules ----------

interface Rule {
  platform: PlatformId;
  signal: string;
  re: RegExp;
}

type PlatformId =
  | "shopify"
  | "woocommerce"
  | "bigcommerce"
  | "squarespace"
  | "wix"
  | "magento"
  | "shopware"
  | "webflow"
  | "prestashop"
  | "ecwid"
  | "salesforce_commerce"
  | "drupal_commerce"
  | "opencart"
  | "weebly_square"
  | "other"
  | "none";

const PLATFORM_NAMES: Record<PlatformId, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  bigcommerce: "BigCommerce",
  squarespace: "Squarespace Commerce",
  wix: "Wix Stores",
  magento: "Magento / Adobe Commerce",
  shopware: "Shopware",
  webflow: "Webflow Ecommerce",
  prestashop: "PrestaShop",
  ecwid: "Ecwid",
  salesforce_commerce: "Salesforce Commerce Cloud",
  drupal_commerce: "Drupal Commerce",
  opencart: "OpenCart",
  weebly_square: "Square Online (Weebly)",
  other: "Custom / unknown",
  none: "No e-commerce detected",
};

const PLATFORM_COLORS: Record<PlatformId, string> = {
  shopify: "#95BF47",
  woocommerce: "#7F54B3",
  bigcommerce: "#34313F",
  squarespace: "#000000",
  wix: "#0C6EFC",
  magento: "#EE672F",
  shopware: "#179DA5",
  webflow: "#4353FF",
  prestashop: "#DF0067",
  ecwid: "#FE7D49",
  salesforce_commerce: "#00A1E0",
  drupal_commerce: "#0678BE",
  opencart: "#0F7AC2",
  weebly_square: "#3A434A",
  other: "#6B6A63",
  none: "#9A998F",
};

const RULES: Rule[] = [
  // Shopify
  { platform: "shopify", signal: "cdn.shopify.com asset", re: /cdn\.shopify\.com/i },
  { platform: "shopify", signal: "Shopify.shop JS global", re: /\bShopify\.shop\b/ },
  { platform: "shopify", signal: "shopify-digital-wallet meta tag", re: /shopify-digital-wallet/i },
  { platform: "shopify", signal: "Shopify checkout redirect script", re: /shopify\.com\/checkouts/i },
  { platform: "shopify", signal: "Shopify analytics", re: /shopify_analytics/i },
  { platform: "shopify", signal: "myshopify.com domain", re: /\.myshopify\.com/i },

  // WooCommerce
  { platform: "woocommerce", signal: "/wp-content/plugins/woocommerce/", re: /\/wp-content\/plugins\/woocommerce\//i },
  { platform: "woocommerce", signal: ".woocommerce CSS class", re: /class=["'][^"']*\bwoocommerce\b/i },
  { platform: "woocommerce", signal: "wp-json wc namespace link", re: /\/wp-json\/wc\//i },
  { platform: "woocommerce", signal: "WooCommerce body class", re: /\bwoocommerce-page\b/i },

  // BigCommerce
  { platform: "bigcommerce", signal: "cdn11.bigcommerce.com asset", re: /cdn1\d\.bigcommerce\.com/i },
  { platform: "bigcommerce", signal: "bigcommerce.com reference", re: /\bbigcommerce\.com\b/i },
  { platform: "bigcommerce", signal: "BCData / Stencil hint", re: /BCData|window\.stencilUtils/ },

  // Squarespace
  { platform: "squarespace", signal: "Squarespace generator meta", re: /<meta\s+name=["']generator["'][^>]+Squarespace/i },
  { platform: "squarespace", signal: "static.squarespace.com asset", re: /static\.squarespace\.com|squarespace-cdn\.com/i },
  { platform: "squarespace", signal: "Static1.squarespace template marker", re: /squarespace\.com\/universal/i },

  // Wix
  { platform: "wix", signal: "Wix generator meta", re: /<meta\s+name=["']generator["'][^>]+Wix\.com/i },
  { platform: "wix", signal: "static.wixstatic.com asset", re: /static\.wixstatic\.com/i },
  { platform: "wix", signal: "wix.com reference", re: /\bwix\.com\b/i },
  { platform: "wix", signal: "parastorage.com asset (Wix CDN)", re: /parastorage\.com/i },

  // Magento / Adobe Commerce
  { platform: "magento", signal: "Magento_Catalog static path", re: /Magento_Catalog/ },
  { platform: "magento", signal: "/static/version path", re: /\/static\/version\d+\//i },
  { platform: "magento", signal: "mage- prefixed JS", re: /mage\/cookies\.js|mage\/utils|mage\/url/i },
  { platform: "magento", signal: "data-mage-init attribute", re: /data-mage-init/i },

  // Shopware
  { platform: "shopware", signal: "Shopware bundles path", re: /\/bundles\/storefront\/|shopware\/cms/i },
  { platform: "shopware", signal: "Shopware twig hint", re: /sw-page-wrapper/i },

  // Webflow
  { platform: "webflow", signal: "Webflow generator meta", re: /<meta\s+name=["']generator["'][^>]+Webflow/i },
  { platform: "webflow", signal: "webflow.com asset", re: /assets\.website-files\.com|webflow\.com/i },

  // PrestaShop
  { platform: "prestashop", signal: "PrestaShop generator meta", re: /<meta\s+name=["']generator["'][^>]+PrestaShop/i },
  { platform: "prestashop", signal: "/themes/<theme>/assets/ts/ pattern", re: /\bprestashop\b/i },

  // Ecwid
  { platform: "ecwid", signal: "ecwid script tag", re: /\becwid\b/i },
  { platform: "ecwid", signal: "app.ecwid.com asset", re: /app\.ecwid\.com|ecwid\.com\/script/i },

  // Salesforce Commerce Cloud (Demandware)
  { platform: "salesforce_commerce", signal: "demandware.static asset", re: /demandware\.static|demandware\.edgesuite\.net/i },
  { platform: "salesforce_commerce", signal: "Salesforce Commerce Cloud script", re: /sfcc-?cloud|salesforcecommercecloud/i },

  // Drupal Commerce
  { platform: "drupal_commerce", signal: "Drupal Commerce module path", re: /\/modules\/(?:contrib\/)?commerce/i },

  // OpenCart
  { platform: "opencart", signal: "OpenCart catalog path", re: /catalog\/view\/theme\/[^/]+\/javascript|opencart/i },

  // Square Online / Weebly
  { platform: "weebly_square", signal: "weeblysite.com asset", re: /weeblysite\.com|weebly\.com/i },
  { platform: "weebly_square", signal: "Square Online generator", re: /<meta\s+name=["']generator["'][^>]+Weebly/i },
];

const CMS_RULES: { name: string; signal: string; re: RegExp }[] = [
  { name: "WordPress", signal: "wp-content path", re: /\/wp-content\//i },
  { name: "WordPress", signal: "WordPress generator meta", re: /<meta[^>]+generator["'][^>]+WordPress/i },
  { name: "Drupal", signal: "Drupal generator meta", re: /<meta[^>]+generator["'][^>]+Drupal/i },
  { name: "Drupal", signal: "drupalSettings JS object", re: /drupalSettings/ },
  { name: "Joomla", signal: "Joomla generator meta", re: /<meta[^>]+generator["'][^>]+Joomla/i },
  { name: "Ghost", signal: "Ghost generator meta", re: /<meta[^>]+generator["'][^>]+Ghost/i },
  { name: "Hugo", signal: "Hugo generator meta", re: /<meta[^>]+generator["'][^>]+Hugo/i },
  { name: "Jekyll", signal: "Jekyll generator meta", re: /<meta[^>]+generator["'][^>]+Jekyll/i },
  { name: "Hubspot CMS", signal: "HubSpot CMS marker", re: /hubspot\.net|hubspotusercontent/i },
  { name: "Webflow", signal: "Webflow generator meta", re: /<meta[^>]+generator["'][^>]+Webflow/i },
];

const ANALYTICS_RULES: { name: string; re: RegExp }[] = [
  { name: "Google Analytics 4", re: /googletagmanager\.com\/gtag\/js\?id=G-/i },
  { name: "Google Tag Manager", re: /googletagmanager\.com\/gtm\.js/i },
  { name: "Universal Analytics", re: /google-analytics\.com\/(?:analytics|ga)\.js/i },
  { name: "Meta Pixel", re: /connect\.facebook\.net\/[\w_]+\/fbevents\.js/i },
  { name: "TikTok Pixel", re: /analytics\.tiktok\.com\/i18n\/pixel/i },
  { name: "Hotjar", re: /static\.hotjar\.com\/c\/hotjar-/i },
  { name: "Klaviyo", re: /klaviyo\.com\/onsite\/js\/klaviyo\.js/i },
  { name: "Pinterest Tag", re: /s\.pinimg\.com\/ct\/core\.js/i },
  { name: "Microsoft Clarity", re: /clarity\.ms\/tag/i },
  { name: "LinkedIn Insight", re: /snap\.licdn\.com\/li\.lms-analytics/i },
  { name: "Mixpanel", re: /cdn\.mxpnl\.com\/libs\/mixpanel/i },
  { name: "Segment", re: /cdn\.segment\.com\/analytics\.js/i },
  { name: "Plausible", re: /plausible\.io\/js\/plausible/i },
  { name: "Fathom", re: /cdn\.usefathom\.com/i },
];

// ---------- Active probes (cheap, optional) ----------

async function probeShopify(origin: string): Promise<boolean> {
  const r = await fetchOnce(`${origin}/products.json?limit=1`, 8_000);
  if (!r.ok) return false;
  try {
    const j = JSON.parse(r.text);
    return Array.isArray(j?.products);
  } catch { return false; }
}

async function probeWoo(origin: string): Promise<boolean> {
  const r = await fetchOnce(`${origin}/wp-json/wc/store/v1/products?per_page=1`, 8_000);
  if (!r.ok) return false;
  try {
    const j = JSON.parse(r.text);
    return Array.isArray(j);
  } catch { return false; }
}

// ---------- Handler ----------

interface DetectResult {
  url: string;
  origin: string;
  platform: PlatformId;
  platform_name: string;
  platform_color: string;
  confidence: "high" | "medium" | "low" | "none";
  signals: string[];
  scoreboard: { platform: PlatformId; name: string; signals: string[] }[];
  cms: string[];
  analytics: string[];
  active_probes: { shopify_products_json: boolean; woocommerce_store_api: boolean };
}

export async function POST(req: NextRequest) {
  let body: { url?: string } = {};
  try { body = (await req.json()) as { url?: string }; } catch { /* allow */ }
  const url = normalizeUrl(body.url || "");
  if (!url) return NextResponse.json({ error: "Enter a valid URL." }, { status: 400 });

  const fetched = await fetchOnce(url);
  if (fetched.status === 0) {
    return NextResponse.json({ error: "Couldn't reach that URL." }, { status: 502 });
  }
  if (!fetched.ok && !fetched.text) {
    return NextResponse.json({ error: `Site responded HTTP ${fetched.status}.` }, { status: 502 });
  }

  const html = fetched.text;
  const origin = new URL(url).origin;

  // Score each platform by counting unique signals.
  const matchedByPlatform = new Map<PlatformId, Set<string>>();
  for (const rule of RULES) {
    if (rule.re.test(html)) {
      if (!matchedByPlatform.has(rule.platform)) matchedByPlatform.set(rule.platform, new Set());
      matchedByPlatform.get(rule.platform)!.add(rule.signal);
    }
  }

  // Run active probes for the two we can verify cheaply. These are the most
  // common platforms so the cost is justified.
  const [shopifyApi, wooApi] = await Promise.all([
    probeShopify(origin),
    probeWoo(origin),
  ]);
  if (shopifyApi) {
    if (!matchedByPlatform.has("shopify")) matchedByPlatform.set("shopify", new Set());
    matchedByPlatform.get("shopify")!.add("Public /products.json endpoint responded");
  }
  if (wooApi) {
    if (!matchedByPlatform.has("woocommerce")) matchedByPlatform.set("woocommerce", new Set());
    matchedByPlatform.get("woocommerce")!.add("Public WooCommerce Store API responded");
  }

  // Pick the leader: highest signal count wins, ties broken by Shopify > Woo > others.
  const PRIORITY: PlatformId[] = [
    "shopify", "woocommerce", "bigcommerce", "magento", "salesforce_commerce",
    "shopware", "prestashop", "squarespace", "wix", "webflow", "ecwid",
    "drupal_commerce", "opencart", "weebly_square",
  ];
  let best: PlatformId = "none";
  let bestCount = 0;
  for (const p of PRIORITY) {
    const s = matchedByPlatform.get(p);
    if (s && s.size > bestCount) { best = p; bestCount = s.size; }
  }

  const signals = Array.from(matchedByPlatform.get(best) ?? []);
  let confidence: DetectResult["confidence"];
  if (best === "none") confidence = "none";
  else if ((shopifyApi && best === "shopify") || (wooApi && best === "woocommerce") || bestCount >= 3) confidence = "high";
  else if (bestCount === 2) confidence = "medium";
  else confidence = "low";

  // CMS — independent of platform.
  const cmsSet = new Set<string>();
  for (const r of CMS_RULES) {
    if (r.re.test(html)) cmsSet.add(r.name);
  }
  const cms = Array.from(cmsSet);

  // Analytics tags.
  const analyticsSet = new Set<string>();
  for (const r of ANALYTICS_RULES) {
    if (r.re.test(html)) analyticsSet.add(r.name);
  }
  const analytics = Array.from(analyticsSet);

  // Scoreboard: every platform that had at least one signal, ranked.
  const scoreboard = Array.from(matchedByPlatform.entries())
    .map(([platform, sigs]) => ({
      platform,
      name: PLATFORM_NAMES[platform],
      signals: Array.from(sigs),
    }))
    .sort((a, b) => b.signals.length - a.signals.length);

  const result: DetectResult = {
    url,
    origin,
    platform: best,
    platform_name: PLATFORM_NAMES[best],
    platform_color: PLATFORM_COLORS[best],
    confidence,
    signals,
    scoreboard,
    cms,
    analytics,
    active_probes: {
      shopify_products_json: shopifyApi,
      woocommerce_store_api: wooApi,
    },
  };

  return NextResponse.json(result);
}
