"""Platform detection + bulk catalog fetchers for Shopify and WooCommerce.

Both Shopify and WooCommerce expose public JSON endpoints that list products
without authentication. Using these is orders of magnitude faster and more
reliable than scraping each product page with a browser.

- Shopify: `/products.json?limit=250&page=N` (all Shopify storefronts by default)
- WooCommerce: `/wp-json/wc/store/v1/products?per_page=100&page=N` (WC Blocks
  Store API — enabled on any Woo install with WC Blocks 5+, which is most modern
  stores)
"""
from __future__ import annotations

import re
from typing import Any, Callable
from urllib.parse import urljoin, urlparse

import httpx


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def normalize_base(url: str) -> str:
    """Return the origin (scheme + host), e.g. `https://shop.example.com`."""
    p = urlparse(url)
    if not p.scheme:
        p = urlparse("https://" + url)
    return f"{p.scheme}://{p.netloc}"


def detect_platform(url: str, timeout: float = 10.0) -> str:
    """Probe the URL and return 'shopify' | 'woocommerce' | 'other'.
    Never raises — returns 'other' on any uncertainty."""
    base = normalize_base(url)
    headers = {"User-Agent": USER_AGENT}
    with httpx.Client(follow_redirects=True, timeout=timeout, headers=headers) as c:
        # 1. Try Shopify /products.json — unambiguous.
        try:
            r = c.get(urljoin(base, "/products.json"), params={"limit": 1})
            if r.status_code == 200 and "products" in (r.json() or {}):
                return "shopify"
        except Exception:
            pass

        # 2. Try WooCommerce Store API
        try:
            r = c.get(urljoin(base, "/wp-json/wc/store/v1/products"), params={"per_page": 1})
            if r.status_code == 200 and isinstance(r.json(), list):
                return "woocommerce"
        except Exception:
            pass

        # 3. Heuristic: fetch HTML, look for markers
        try:
            r = c.get(url)
            if r.status_code == 200:
                html = r.text
                if "cdn.shopify.com" in html or 'Shopify.shop' in html or 'shopify-digital-wallet' in html:
                    return "shopify"
                if "woocommerce" in html.lower() or "/wp-json/wc/" in html:
                    return "woocommerce"
        except Exception:
            pass

    return "other"


def _shopify_to_product(p: dict, base: str) -> dict:
    """Map a Shopify /products.json product into our Product dict shape."""
    images = [i.get("src") for i in (p.get("images") or []) if i.get("src")]
    variants_out = []
    min_price: float | None = None
    min_compare: float | None = None
    total_stock = 0
    any_in_stock = False
    for v in p.get("variants") or []:
        try:
            price = float(v.get("price")) if v.get("price") is not None else None
        except (TypeError, ValueError):
            price = None
        try:
            compare = float(v.get("compare_at_price")) if v.get("compare_at_price") else None
        except (TypeError, ValueError):
            compare = None
        if price is not None:
            min_price = price if min_price is None else min(min_price, price)
        if compare is not None:
            min_compare = compare if min_compare is None else min(min_compare, compare)
        qty = v.get("inventory_quantity")
        if isinstance(qty, (int, float)):
            total_stock += int(qty)
            if qty > 0:
                any_in_stock = True
        variants_out.append({
            "title": v.get("title"),
            "sku": v.get("sku"),
            "price": price,
            "compare_at_price": compare,
            "option1": v.get("option1"),
            "option2": v.get("option2"),
            "option3": v.get("option3"),
            "inventory_quantity": qty,
        })

    categories = []
    pt = p.get("product_type")
    if pt:
        categories.append(pt)

    body_html = p.get("body_html") or ""
    description = re.sub(r"<[^>]+>", " ", body_html)
    description = re.sub(r"\s+", " ", description).strip()
    short = description[:180].rstrip()
    if len(description) > 180:
        short = short.rsplit(" ", 1)[0] + "…"

    handle = p.get("handle")
    return {
        "title": p.get("title"),
        "handle": handle,
        "sku": (variants_out[0]["sku"] if variants_out else None),
        "brand": p.get("vendor"),
        "price": min_price,
        "compare_at_price": min_compare,
        "currency": "USD",
        "short_description": short or None,
        "description": description or None,
        "categories": categories,
        "tags": _normalize_tags(p.get("tags")),
        "images": images,
        "variants": variants_out,
        "in_stock": any_in_stock if variants_out else None,
        "source_url": urljoin(base, f"/products/{handle}") if handle else None,
    }


def _normalize_tags(raw: Any) -> list[str]:
    """Shopify's /products.json returns `tags` as a comma-separated string on
    classic stores and as an array on newer themes. Handle both."""
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    if isinstance(raw, str):
        return [t.strip() for t in raw.split(",") if t.strip()]
    return []


def fetch_shopify_catalog(
    url: str,
    on_progress: Callable[[int, int | None], None] | None = None,
    max_products: int = 10000,
) -> list[dict]:
    base = normalize_base(url)
    headers = {"User-Agent": USER_AGENT}
    out: list[dict] = []
    page = 1
    with httpx.Client(follow_redirects=True, timeout=30.0, headers=headers) as c:
        while len(out) < max_products:
            r = c.get(urljoin(base, "/products.json"), params={"limit": 250, "page": page})
            r.raise_for_status()
            data = r.json() or {}
            batch = data.get("products") or []
            if not batch:
                break
            for p in batch:
                out.append(_shopify_to_product(p, base))
                if len(out) >= max_products:
                    break
            if on_progress:
                on_progress(len(out), None)
            if len(batch) < 250:
                break
            page += 1
    return out


def _woo_to_product(p: dict, base: str) -> dict:
    images = [i.get("src") for i in (p.get("images") or []) if i.get("src")]
    categories = [c.get("name") for c in (p.get("categories") or []) if c.get("name")]
    tags = [t.get("name") for t in (p.get("tags") or []) if t.get("name")]
    prices = p.get("prices") or {}
    try:
        price = float(prices.get("price")) / (10 ** int(prices.get("currency_minor_unit", 2))) if prices.get("price") else None
    except (TypeError, ValueError):
        price = None
    try:
        compare = float(prices.get("regular_price")) / (10 ** int(prices.get("currency_minor_unit", 2))) if prices.get("regular_price") else None
    except (TypeError, ValueError):
        compare = None
    currency = prices.get("currency_code") or "USD"

    description = re.sub(r"<[^>]+>", " ", p.get("description") or "")
    description = re.sub(r"\s+", " ", description).strip()
    short = re.sub(r"<[^>]+>", " ", p.get("short_description") or "")
    short = re.sub(r"\s+", " ", short).strip()
    if not short and description:
        short = description[:180].rstrip()
        if len(description) > 180:
            short = short.rsplit(" ", 1)[0] + "…"

    return {
        "title": p.get("name"),
        "handle": p.get("slug"),
        "sku": p.get("sku"),
        "brand": None,
        "price": price,
        "compare_at_price": compare if compare and price and compare > price else None,
        "currency": currency,
        "short_description": short or None,
        "description": description or None,
        "categories": categories,
        "tags": tags,
        "images": images,
        "variants": [],
        "in_stock": p.get("is_in_stock"),
        "source_url": p.get("permalink"),
    }


def fetch_woocommerce_catalog(
    url: str,
    on_progress: Callable[[int, int | None], None] | None = None,
    max_products: int = 10000,
) -> list[dict]:
    base = normalize_base(url)
    headers = {"User-Agent": USER_AGENT}
    out: list[dict] = []
    page = 1
    total_expected: int | None = None
    with httpx.Client(follow_redirects=True, timeout=30.0, headers=headers) as c:
        while len(out) < max_products:
            r = c.get(
                urljoin(base, "/wp-json/wc/store/v1/products"),
                params={"per_page": 100, "page": page},
            )
            if r.status_code != 200:
                break
            if total_expected is None:
                try:
                    total_expected = int(r.headers.get("X-WP-Total") or r.headers.get("x-wp-total") or 0) or None
                except ValueError:
                    total_expected = None
            batch = r.json() or []
            if not batch:
                break
            for p in batch:
                out.append(_woo_to_product(p, base))
                if len(out) >= max_products:
                    break
            if on_progress:
                on_progress(len(out), total_expected)
            if len(batch) < 100:
                break
            page += 1
    return out
