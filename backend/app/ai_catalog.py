"""AI-driven catalog discovery for sites that don't match any of our
known platforms (Shopify, WooCommerce, wp_listings).

When `detect_platform()` returns 'other' but the user asked for a
catalog extract, we land here instead of failing. Phases:

  1. Fetch the homepage HTML.
  2. ONE LLM call answers two questions:
       - which URLs on this site list multiple products?
       - what does a single-product detail URL look like (regex)?
  3. Walk each catalog index page, collect anchor hrefs matching the
     pattern, dedup. Light pagination heuristic (`/page/N/`,
     `?page=N`).
  4. For each discovered product URL, run the existing single-product
     pipeline (heuristic → AI config → Firecrawl fallback) — exactly
     the same code path that handles platform=Other today, just looped.

Cost: 1 LLM call for discovery (cheap on gemini-2.5-flash) + the
usual extract cost per product. We charge the standard 1-token-per-
saved-product rate; the discovery call is on us.
"""
from __future__ import annotations

import json
import re
from typing import Callable, Iterable
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .config import get_settings
from .errors import SiteBlockedError
from .platforms import USER_AGENT, normalize_base


_MAX_HTML_CHARS = 35_000  # ~8.5k input tokens — leaves headroom for output

_DISCOVERY_SYSTEM_PROMPT = """You analyse an e-commerce site's homepage HTML and figure out how its products are organised.

Return EXACTLY ONE JSON object — no prose, no markdown fences:
{
  "catalog_urls":          [ "absolute URL of a page that lists multiple products" ],
  "product_url_patterns":  [ "Python regex (no flags, no anchors) matching a product-detail URL path" ]
}

Guidance:
- catalog_urls: shop / category / collection / inventory / browse / "for-sale" pages — anywhere multiple products are listed. 1 to 12 entries, distinct paths. Use absolute URLs. Don't include the bare homepage, blog index, contact/about/policy pages.
- product_url_patterns: ordered list of candidate path-only patterns for individual product pages. Return ALL plausible patterns you see — we'll validate which one actually matches links on the catalog pages. Examples:
    Wix Stores:    "/product-page/[^/]+"
    Shopify-like:  "/products/[^/]+"
    BigCommerce:   "/product/[^/]+"
    Square Online: "/s/shop/[^/]+"
    Custom:        "/shop/[^/]+/[^/]+"
- Anchor on path segments, not the full URL. Don't add ^/$ — we use re.search.
- DO NOT include blog/post URL patterns (/post/, /blog/, /news/, /article/) even if you see them — those aren't products.
- If the homepage doesn't reveal product URLs, return [] for product_url_patterns and we'll fall back to common patterns.
- If you can't find catalog pages, return [] for catalog_urls.
- Never invent URLs."""

# Fallback patterns we'll try when the LLM gives us nothing usable. Ordered
# most-common-first. ANY anchor on the catalog pages matching one of these
# is treated as a product URL.
_FALLBACK_PRODUCT_PATTERNS = (
    r"/product-page/[^/]+",   # Wix Stores
    r"/products/[^/]+",       # Shopify, generic
    r"/product/[^/]+",        # WooCommerce single-product, BigCommerce
    r"/shop/[^/]+",           # WP themes, custom
    r"/item/[^/]+",           # eBay-style, custom
    r"/p/[^/]+",              # short-form (Target, etc.)
)


def _trim_html(html: str, max_chars: int = _MAX_HTML_CHARS) -> str:
    """Drop noise (styles/scripts/svg) and truncate. Same idea as
    ai_scraper._trim_html but keeps JSON-LD scripts since they often
    carry catalog structure metadata."""
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["style", "noscript", "svg"]):
        t.decompose()
    for t in soup.find_all("script"):
        if (t.get("type") or "").lower() != "application/ld+json":
            t.decompose()
    return str(soup)[:max_chars]


def _call_llm(url: str, html: str) -> dict | None:
    """One-shot discovery call. Returns the parsed JSON or None on any
    failure (no key, HTTP error, parse error)."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None

    trimmed = _trim_html(html)
    payload = {
        "model": settings.openrouter_model,  # project-wide default (gemini-2.5-flash)
        "messages": [
            {"role": "system", "content": _DISCOVERY_SYSTEM_PROMPT},
            {"role": "user", "content": f"Homepage URL: {url}\n\nHTML ({len(trimmed)} chars):\n{trimmed}"},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    try:
        with httpx.Client(timeout=90.0) as c:
            r = c.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://prodlyft.com",
                    "X-Title": "Prodlyft ai_catalog discovery",
                },
                json=payload,
            )
        if r.status_code != 200:
            print(f"[ai_catalog] discovery HTTP {r.status_code}: {r.text[:240]}", flush=True)
            return None
        content = (r.json().get("choices") or [{}])[0].get("message", {}).get("content") or ""
    except Exception as e:  # noqa: BLE001
        print(f"[ai_catalog] discovery call failed: {e}", flush=True)
        return None

    # Tolerant JSON parse — strip markdown fences, fall back to a
    # balanced {...} substring if the model added prose.
    for candidate in (content, _strip_fences(content), _first_brace_block(content)):
        if not candidate:
            continue
        try:
            return json.loads(candidate)
        except Exception:
            continue
    return None


def _strip_fences(s: str) -> str:
    m = re.match(r"```(?:json)?\s*([\s\S]*?)```", s.strip(), re.I)
    return m.group(1).strip() if m else ""


def _first_brace_block(s: str) -> str:
    start = s.find("{")
    if start < 0:
        return ""
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        ch = s[i]
        if esc:
            esc = False
            continue
        if ch == "\\":
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start : i + 1]
    return ""


_BLOCK_STATUSES = frozenset({401, 403, 406, 429, 503})


def _detect_mitigator(response: httpx.Response) -> str | None:
    """Best-effort identification of the WAF that blocked us, purely from
    response headers. Returns a lowercase vendor name or None."""
    h = response.headers
    if h.get("cf-mitigated") or h.get("cf-ray") or (h.get("server", "").lower() == "cloudflare"):
        return "cloudflare"
    server = h.get("server", "").lower()
    if "akamai" in server or h.get("akamai-grn"):
        return "akamai"
    if h.get("x-datadome") or "datadome" in h.get("set-cookie", "").lower():
        return "datadome"
    if h.get("x-iinfo") or "incapsula" in h.get("set-cookie", "").lower():
        return "imperva"
    return None


def _fetch(url: str, timeout: float = 30.0) -> str:
    with httpx.Client(
        follow_redirects=True,
        timeout=timeout,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    ) as c:
        r = c.get(url)
        if r.status_code != 200:
            if r.status_code in _BLOCK_STATUSES:
                raise SiteBlockedError(
                    host=urlparse(url).netloc,
                    status=r.status_code,
                    mitigator=_detect_mitigator(r),
                )
            raise RuntimeError(f"HTTP {r.status_code}")
        return r.text


def _paginate_url(catalog_url: str, page: int) -> str:
    """Best-effort pagination URL. Tries /page/N/ first (most common),
    then ?page=N as a fallback the caller can probe."""
    parsed = urlparse(catalog_url)
    base = catalog_url.rstrip("/")
    return f"{base}/page/{page}/"


def _discover_product_urls(
    catalog_html: str,
    catalog_url: str,
    base: str,
    pattern: re.Pattern[str],
    limit: int,
) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for m in re.finditer(r'href="([^"]+)"', catalog_html):
        href = m.group(1)
        abs_url = urljoin(catalog_url, href).split("#", 1)[0].split("?", 1)[0]
        if not abs_url.startswith(base):
            continue
        path = urlparse(abs_url).path
        if not pattern.search(path):
            continue
        if abs_url in seen:
            continue
        seen.add(abs_url)
        out.append(abs_url)
        if len(out) >= limit:
            break
    return out


def fetch_ai_catalog(
    url: str,
    on_progress: Callable[[int, int | None], None] | None = None,
    max_products: int = 100,
) -> list[dict]:
    """Discover + extract products from a site we don't recognise.

    Returns an empty list when discovery yields nothing — caller (the
    worker) interprets that as "we tried, nothing to scrape" and
    surfaces a friendly error.
    """
    # Local imports to dodge the worker's circular-import risk
    # (scraper/ai/ai_scraper import platforms which imports … etc.).
    from .scraper import fetch_html, extract_heuristic
    from .ai import clean_product
    from .ai_scraper import get_or_generate_config, extract_with_config
    from . import firecrawl

    base = normalize_base(url)
    if on_progress:
        on_progress(0, None)

    # Phase 1: discover layout.
    try:
        homepage_html = _fetch(base + "/")
    except SiteBlockedError:
        # Let the worker surface the specific "site blocked us" message
        # instead of the generic "couldn't find products" one.
        raise
    except Exception as e:
        print(f"[ai_catalog] couldn't fetch homepage: {e}", flush=True)
        return []
    layout = _call_llm(base, homepage_html)
    if not layout:
        print("[ai_catalog] discovery returned nothing", flush=True)
        return []

    catalog_urls = [u for u in (layout.get("catalog_urls") or []) if isinstance(u, str)]
    # Accept either the new "product_url_patterns" list or the older
    # singular "product_url_pattern" for back-compat.
    raw_patterns: list[str] = []
    if isinstance(layout.get("product_url_patterns"), list):
        raw_patterns = [p for p in layout["product_url_patterns"] if isinstance(p, str) and p.strip()]
    elif isinstance(layout.get("product_url_pattern"), str) and layout["product_url_pattern"].strip():
        raw_patterns = [layout["product_url_pattern"].strip()]

    # Always append our fallback patterns so a site we recognise by
    # convention (Wix /product-page/, Shopify /products/) still works
    # even if the LLM misses it.
    candidate_patterns: list[str] = []
    seen_p: set[str] = set()
    for p in [*raw_patterns, *_FALLBACK_PRODUCT_PATTERNS]:
        if p in seen_p:
            continue
        try:
            re.compile(p)
        except re.error:
            continue
        seen_p.add(p)
        candidate_patterns.append(p)

    if not catalog_urls or not candidate_patterns:
        print(
            f"[ai_catalog] discovery empty (catalogs={len(catalog_urls)}, patterns={len(candidate_patterns)})",
            flush=True,
        )
        return []
    print(
        f"[ai_catalog] discovered {len(catalog_urls)} catalog page(s); "
        f"candidate product patterns: {candidate_patterns}",
        flush=True,
    )

    # Phase 2: walk catalog pages. For each page, test ALL candidate
    # patterns and use whichever returns the most product URLs. This
    # rescues us when the LLM picked a blog pattern over the real
    # product one (happened on jandaexotics.com — picked /post/
    # instead of /product-page/).
    product_urls: list[str] = []
    seen: set[str] = set()
    target_url_count = max(max_products * 2, 20)

    def best_pattern_urls(cat_html: str, cat_url: str, limit: int) -> list[str]:
        best: list[str] = []
        for pat_str in candidate_patterns:
            pat = re.compile(pat_str)
            urls = _discover_product_urls(cat_html, cat_url, base, pat, limit)
            if len(urls) > len(best):
                best = urls
        return best

    for cat_url in catalog_urls:
        if len(product_urls) >= target_url_count:
            break
        page = 1
        while len(product_urls) < target_url_count:
            cur = cat_url if page == 1 else _paginate_url(cat_url, page)
            try:
                cat_html = _fetch(cur)
            except Exception:
                break
            new_here = best_pattern_urls(cat_html, cur, target_url_count - len(product_urls) + 5)
            new_count = 0
            for u in new_here:
                if u not in seen:
                    seen.add(u)
                    product_urls.append(u)
                    new_count += 1
            if new_count == 0:
                break  # this catalog page yielded nothing new — stop paginating
            page += 1
            if page > 10:
                break  # cap pagination per catalog
    print(f"[ai_catalog] collected {len(product_urls)} product URL(s)", flush=True)
    if not product_urls:
        return []

    # Phase 3: extract each product with the existing single-product
    # pipeline. We cap at max_products before extraction so we don't
    # over-charge tokens (each saved product = 1 token).
    products: list[dict] = []
    for purl in product_urls[: max(max_products * 2, max_products + 10)]:
        if len(products) >= max_products:
            break
        try:
            html = fetch_html(purl)
        except Exception as e:
            print(f"[ai_catalog] fetch failed for {purl}: {e}", flush=True)
            continue

        raw = extract_heuristic(html, purl)
        if not raw.get("title") or raw.get("price") is None:
            try:
                cfg, _from_cache = get_or_generate_config(purl, html)
            except Exception as e:
                print(f"[ai_catalog] ai_config failed for {purl}: {e}", flush=True)
                cfg = None
            if cfg:
                try:
                    ai_raw = extract_with_config(html, cfg, purl)
                    for k, v in ai_raw.items():
                        if v and not raw.get(k):
                            raw[k] = v
                except Exception as e:
                    print(f"[ai_catalog] ai_extract failed for {purl}: {e}", flush=True)

        if (not raw.get("title") or raw.get("price") is None) and firecrawl.is_enabled():
            try:
                fc_raw = firecrawl.scrape(purl)
                if fc_raw:
                    for k, v in fc_raw.items():
                        if v and not raw.get(k):
                            raw[k] = v
            except Exception as e:
                print(f"[ai_catalog] firecrawl failed for {purl}: {e}", flush=True)

        if not raw.get("title"):
            continue  # nothing usable — skip silently, try the next URL

        try:
            cleaned = clean_product(raw)
        except Exception as e:
            print(f"[ai_catalog] clean_product failed for {purl}: {e}", flush=True)
            continue
        products.append(cleaned)
        if on_progress:
            on_progress(len(products), max_products)

    print(f"[ai_catalog] extracted {len(products)}/{max_products} products", flush=True)
    return products
