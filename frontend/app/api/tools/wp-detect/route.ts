import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Safari/537.36 ProdlyftBot/1.0";

const POPULAR_PLUGIN_NAMES: Record<string, string> = {
  "elementor": "Elementor",
  "elementor-pro": "Elementor Pro",
  "woocommerce": "WooCommerce",
  "wordpress-seo": "Yoast SEO",
  "wp-rocket": "WP Rocket",
  "wpforms-lite": "WPForms",
  "wpforms": "WPForms Pro",
  "contact-form-7": "Contact Form 7",
  "akismet": "Akismet",
  "jetpack": "Jetpack",
  "all-in-one-seo-pack": "All in One SEO",
  "rankmath": "Rank Math SEO",
  "seo-by-rank-math": "Rank Math SEO",
  "advanced-custom-fields": "Advanced Custom Fields",
  "advanced-custom-fields-pro": "ACF Pro",
  "wp-super-cache": "WP Super Cache",
  "w3-total-cache": "W3 Total Cache",
  "litespeed-cache": "LiteSpeed Cache",
  "wp-fastest-cache": "WP Fastest Cache",
  "autoptimize": "Autoptimize",
  "wpml-string-translation": "WPML",
  "polylang": "Polylang",
  "translatepress-multilingual": "TranslatePress",
  "redirection": "Redirection",
  "duplicator": "Duplicator",
  "updraftplus": "UpdraftPlus",
  "really-simple-ssl": "Really Simple SSL",
  "mailpoet": "MailPoet",
  "fluent-smtp": "FluentSMTP",
  "wp-mail-smtp": "WP Mail SMTP",
  "easy-wp-smtp": "Easy WP SMTP",
  "monster-insights": "MonsterInsights",
  "google-analytics-for-wordpress": "MonsterInsights",
  "google-site-kit": "Site Kit by Google",
  "wpforms-pro": "WPForms Pro",
  "ninja-forms": "Ninja Forms",
  "gravityforms": "Gravity Forms",
  "popup-maker": "Popup Maker",
  "smush": "Smush",
  "wp-smushit": "Smush",
  "imagify": "Imagify",
  "ewww-image-optimizer": "EWWW Image Optimizer",
  "shortpixel-image-optimiser": "ShortPixel",
  "astra-sites": "Astra Starter Templates",
  "header-footer-elementor": "Elementor Header & Footer Builder",
  "essential-addons-for-elementor-lite": "Essential Addons for Elementor",
  "elementskit-lite": "ElementsKit",
  "ultimate-addons-for-gutenberg": "Spectra",
  "kadence-blocks": "Kadence Blocks",
  "stackable-ultimate-gutenberg-blocks": "Stackable",
  "blocksy-companion": "Blocksy Companion",
  "premium-addons-for-elementor": "Premium Addons for Elementor",
};

const POPULAR_THEME_NAMES: Record<string, string> = {
  "astra": "Astra",
  "kadence": "Kadence",
  "blocksy": "Blocksy",
  "generatepress": "GeneratePress",
  "oceanwp": "OceanWP",
  "neve": "Neve",
  "hello-elementor": "Hello Elementor",
  "twentytwentyfour": "Twenty Twenty-Four",
  "twentytwentythree": "Twenty Twenty-Three",
  "twentytwentytwo": "Twenty Twenty-Two",
  "twentytwentyone": "Twenty Twenty-One",
  "divi": "Divi",
  "Divi": "Divi",
  "avada": "Avada",
  "Avada": "Avada",
  "betheme": "BeTheme",
  "the7": "The7",
  "enfold": "Enfold",
  "salient": "Salient",
  "x": "X Theme",
  "flatsome": "Flatsome",
  "porto": "Porto",
  "shopkeeper": "Shopkeeper",
  "storefront": "Storefront",
  "woodmart": "Woodmart",
  "electro": "Electro",
};

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function normalizeUrl(input: string): string | null {
  const trimmed = (input || "").trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string, timeoutMs = 20_000): Promise<{ ok: boolean; text: string; status: number }> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await r.text();
    return { ok: r.ok, text, status: r.status };
  } catch {
    return { ok: false, text: "", status: 0 };
  }
}

function looksLikeWordPress(html: string): { yes: boolean; signals: string[] } {
  const signals: string[] = [];
  if (/\/wp-content\//i.test(html)) signals.push("wp-content path");
  if (/\/wp-includes\//i.test(html)) signals.push("wp-includes path");
  if (/<meta[^>]+name=["']generator["'][^>]+WordPress/i.test(html)) signals.push("WordPress generator meta tag");
  if (/api\.w\.org/i.test(html)) signals.push("WP REST API link");
  if (/wp-json/i.test(html)) signals.push("wp-json reference");
  if (/wp-emoji-release/i.test(html)) signals.push("WP emoji loader");
  return { yes: signals.length > 0, signals };
}

function detectVersion(html: string): string | null {
  const m = html.match(/<meta\s+name=["']generator["']\s+content=["']WordPress\s+([\d.]+)["']/i);
  return m?.[1] ?? null;
}

function detectTheme(html: string, baseUrl: string): { slug: string; style_url: string | null } | null {
  // Prefer the explicit stylesheet link.
  const styleMatch = html.match(
    /<link[^>]+href=["']([^"']*\/wp-content\/themes\/([^/?#]+)\/style\.css[^"']*)["'][^>]*>/i,
  );
  if (styleMatch) {
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(styleMatch[1], baseUrl).toString();
    } catch {
      absoluteUrl = styleMatch[1];
    }
    return { slug: styleMatch[2], style_url: absoluteUrl };
  }
  // Fallback: any reference to wp-content/themes/<slug>/.
  const anyMatch = html.match(/\/wp-content\/themes\/([A-Za-z0-9_.-]+)\//);
  if (anyMatch) return { slug: anyMatch[1], style_url: null };
  return null;
}

function parseThemeStyleHeader(css: string): Record<string, string> | null {
  const headerMatch = css.match(/^\s*\/\*([\s\S]*?)\*\//);
  if (!headerMatch) return null;
  const lines = headerMatch[1].split("\n");
  const out: Record<string, string> = {};
  for (const line of lines) {
    const kv = line.match(/^\s*([A-Za-z][\w\s-]*?)\s*:\s*(.+?)\s*$/);
    if (kv) out[kv[1].trim()] = kv[2].trim();
  }
  return Object.keys(out).length ? out : null;
}

function detectPlugins(html: string): string[] {
  const set = new Set<string>();
  const re = /\/wp-content\/plugins\/([A-Za-z0-9_.-]+)\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    set.add(m[1]);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

interface DetectResult {
  url: string;
  wordpress: boolean;
  signals: string[];
  version: string | null;
  theme: {
    slug: string;
    name: string;
    author?: string | null;
    author_uri?: string | null;
    theme_uri?: string | null;
    version?: string | null;
    description?: string | null;
    license?: string | null;
    tags?: string | null;
    template?: string | null;
    style_url: string | null;
  } | null;
  plugins: { slug: string; name: string }[];
  message?: string;
}

export async function POST(req: NextRequest) {
  let body: { url?: string } = {};
  try {
    body = (await req.json()) as { url?: string };
  } catch { /* allow empty */ }

  const url = normalizeUrl(body.url || "");
  if (!url) {
    return NextResponse.json({ error: "Enter a valid URL." }, { status: 400 });
  }

  const fetched = await fetchText(url);
  if (!fetched.ok && fetched.status === 0) {
    return NextResponse.json({ error: "Couldn't reach that URL." }, { status: 502 });
  }
  if (!fetched.ok) {
    return NextResponse.json(
      { error: `Site responded with HTTP ${fetched.status}.` },
      { status: 502 },
    );
  }

  const html = fetched.text;
  const wp = looksLikeWordPress(html);
  if (!wp.yes) {
    const r: DetectResult = {
      url,
      wordpress: false,
      signals: [],
      version: null,
      theme: null,
      plugins: [],
      message: "This site doesn't appear to be running WordPress.",
    };
    return NextResponse.json(r);
  }

  const themeDetect = detectTheme(html, url);
  let themeMeta: Record<string, string> | null = null;
  if (themeDetect?.style_url) {
    const r = await fetchText(themeDetect.style_url, 10_000);
    if (r.ok) themeMeta = parseThemeStyleHeader(r.text);
  }

  const pluginSlugs = detectPlugins(html);
  const plugins = pluginSlugs.map((slug) => ({
    slug,
    name: POPULAR_PLUGIN_NAMES[slug] ?? titleCase(slug),
  }));

  const result: DetectResult = {
    url,
    wordpress: true,
    signals: wp.signals,
    version: detectVersion(html),
    theme: themeDetect
      ? {
          slug: themeDetect.slug,
          name: themeMeta?.["Theme Name"] || POPULAR_THEME_NAMES[themeDetect.slug] || titleCase(themeDetect.slug),
          author: themeMeta?.["Author"] ?? null,
          author_uri: themeMeta?.["Author URI"] ?? null,
          theme_uri: themeMeta?.["Theme URI"] ?? null,
          version: themeMeta?.["Version"] ?? null,
          description: themeMeta?.["Description"] ?? null,
          license: themeMeta?.["License"] ?? null,
          tags: themeMeta?.["Tags"] ?? null,
          template: themeMeta?.["Template"] ?? null,
          style_url: themeDetect.style_url,
        }
      : null,
    plugins,
  };

  return NextResponse.json(result);
}
