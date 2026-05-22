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


# Slugs we'll look for when a WordPress site has NO products on its
# WooCommerce Store API but does expose a custom listing post type
# (Motors theme = /listings/<slug>/, real estate themes use /properties/,
# job boards use /jobs/, etc.). Pulled from the inventory / listing
# index page when we hit the wp_listings branch.
WP_LISTING_PATH_SEGMENTS = (
    "listings", "listing", "inventory", "vehicles", "cars", "autos",
    "properties", "property", "houses", "homes", "rentals",
    "jobs", "members", "directory",
)
# Inventory/index pages we'll try in order to discover listing URLs
# (first one that 200s and contains listing-shaped URLs wins).
WP_LISTING_INDEX_CANDIDATES = (
    "/inventory/", "/listings/", "/properties/", "/vehicles/", "/cars/",
    "/jobs/", "/directory/", "/shop/",
)


def detect_platform(url: str, timeout: float = 10.0) -> str:
    """Probe the URL and return one of:
        'shopify' | 'woocommerce' | 'wp_listings' | 'other'.

    `wp_listings` is for WordPress sites whose products aren't sold via
    WooCommerce — typically vehicle/realty/jobs listing themes (Motors,
    Houzez, WP Job Manager, etc.) that register a custom post type with
    show_in_rest=false. Detected when:
      1. The site advertises wp-json (it's WordPress)
      2. WooCommerce Store API is missing OR returns 0 products
      3. The homepage HTML references a path like /listings/<slug>/

    Never raises — returns 'other' on any uncertainty.
    """
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

        # 2. Try WooCommerce Store API — count results: 0 means the
        #    site has WC installed but no actual products (likely a
        #    listings-CPT site), >0 means it's a real Woo store.
        wp_likely = False
        woo_result_count: int | None = None
        try:
            r = c.get(urljoin(base, "/wp-json/wc/store/v1/products"), params={"per_page": 1})
            if r.status_code == 200:
                data = r.json()
                if isinstance(data, list):
                    woo_result_count = len(data)
                    if woo_result_count > 0:
                        return "woocommerce"
                    # Endpoint exists but empty — definitely WordPress;
                    # fall through to listings detection.
                    wp_likely = True
        except Exception:
            pass

        # 3. Heuristic: fetch HTML, look for markers
        html = ""
        try:
            r = c.get(url)
            if r.status_code == 200:
                html = r.text
                if "cdn.shopify.com" in html or "Shopify.shop" in html or "shopify-digital-wallet" in html:
                    return "shopify"
                # Confirm WordPress one way or another.
                if (
                    "/wp-json/" in html
                    or "/wp-content/" in html
                    or 'name="generator" content="WordPress' in html.lower().replace('"', '"')
                    or any(f'"https://api.w.org/"' in l for l in r.headers.get_list("link") or [])
                ):
                    wp_likely = True
                # If WC is referenced AND we never confirmed Woo above,
                # treat as woocommerce — the Store API might be locked
                # down but the catalog is still WC-based.
                if (
                    woo_result_count is None
                    and ("/wp-json/wc/" in html or "woocommerce" in html.lower())
                ):
                    return "woocommerce"
        except Exception:
            pass

        # 4. WordPress without WooCommerce products → check for a
        #    listing-shaped URL on the homepage (e.g. /listings/2021-bmw…/).
        if wp_likely and html:
            for seg in WP_LISTING_PATH_SEGMENTS:
                # Match href="https://host/<seg>/<slug>/" or relative /seg/slug/
                pat = re.compile(rf'href="[^"]*?/{re.escape(seg)}/[^"/#?][^"#?]*?/"', re.I)
                if pat.search(html):
                    return "wp_listings"

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


# ---------------------------------------------------------------------------
# WordPress listings-CPT scraper (Motors / real estate / jobs themes etc.)
# ---------------------------------------------------------------------------
# Currencies we'll recognise in the inventory HTML. Either form must
# include a real currency symbol or 3-letter code — without that
# constraint we'd match every stray number in the page (e.g. JS
# literals like `download:!1` would parse as $1).
_PRICE_PATTERN = re.compile(
    r"""(?:
            (?P<sym>[$€£¥])\s*
            (?P<amount_sym>[\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?)
          |
            (?P<amount_code>[\d]{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{3,}(?:\.\d{1,2})?)
            \s*
            (?P<code>FCFA|XAF|NGN|USD|EUR|GBP|CAD|AUD|ZAR|KES|GHS)\b
        )
    """,
    re.X,
)
_REQUEST_PRICE_RE = re.compile(
    r"(request\s+price|call\s+for\s+price|price\s+on\s+request|\bpoa\b)",
    re.I,
)
_FINANCE_TERMS_RE = re.compile(
    r"down\s+payment[^\d]*([\d,]+).{0,80}?monthly\s+payment[^\d]*([\d,]+)",
    re.I | re.S,
)
# Anything below this is almost certainly a stray number we matched
# (a quantity, a star rating, etc.), not a real listing price.
_MIN_PLAUSIBLE_PRICE = 100.0


def _looks_listing_url(href: str, base: str) -> bool:
    """True if `href` looks like a single listing detail URL on `base`.

    Distinguishes real listing slugs from brand/taxonomy pages by
    requiring the slug to be at least 8 chars AND either contain a
    4-digit year OR have 3+ hyphen-separated words. That excludes
    /listings/bmw/, /listings/sedan/, /properties/houston/ but admits
    /listings/2021-bmw-330i-xdrive/, /properties/3-bed-house-in-houston/.
    """
    if not href:
        return False
    abs_url = urljoin(base + "/", href).split("#", 1)[0].split("?", 1)[0]
    if not abs_url.startswith(base):
        return False
    path = urlparse(abs_url).path.rstrip("/")
    parts = [p for p in path.split("/") if p]
    if len(parts) < 2:
        return False
    if parts[-2] not in WP_LISTING_PATH_SEGMENTS:
        return False
    slug = parts[-1]
    if len(slug) < 8:
        return False
    # A 4-digit year inside the slug is the strongest signal for a real
    # listing across the themes we target (Motors prefixes the year on
    # vehicle slugs; real-estate themes include build-year on properties).
    has_year = bool(re.search(r"\b(19|20)\d{2}\b", slug))
    word_count = len([w for w in slug.split("-") if w])
    return has_year or word_count >= 3


def _find_listing_urls(html: str, base: str, limit: int) -> list[str]:
    """Pull unique listing detail URLs from index HTML, preserving order."""
    seen: set[str] = set()
    out: list[str] = []
    for m in re.finditer(r'href="([^"]+)"', html):
        href = m.group(1)
        if not _looks_listing_url(href, base):
            continue
        abs_url = urljoin(base + "/", href).split("#", 1)[0].split("?", 1)[0]
        if not abs_url.endswith("/"):
            abs_url += "/"
        if abs_url in seen:
            continue
        seen.add(abs_url)
        out.append(abs_url)
        if len(out) >= limit:
            break
    return out


def _strip_html_text(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def _looks_sold(window_after: str) -> bool:
    """Skip listings tagged Sold — we don't want them in the export."""
    return bool(re.search(r"\b(sold|out\s+of\s+stock)\b", window_after[:120], re.I))


def _extract_listing_card(html: str, url: str) -> dict | None:
    """Walk every occurrence of `url` in `html`; return the cleanest
    matching card (title + price + image) found in the preceding ~900
    chars (which is where the carousel/grid card typically renders its
    contents before the title link)."""
    fallback: dict | None = None
    for m in re.finditer(re.escape(url), html):
        pos = m.start()
        before = html[max(0, pos - 900) : pos]
        after = html[pos : pos + 400]

        if _looks_sold(after):
            continue

        # Title: last <img alt="..."> in `before` that looks like a vehicle/listing title.
        title: str | None = None
        for am in reversed(list(re.finditer(r'alt="([^"]+)"', before))):
            cand = am.group(1).strip()
            # 4+ chars, not an obvious icon name, ideally has a year
            if 4 <= len(cand) <= 200 and not cand.lower().startswith(("icon", "logo", "arrow")):
                title = cand
                break

        # Price: a real currency-prefixed amount (`$ 4,500`, `€10,000`,
        # `1,500 USD`) OR a finance breakdown (`Down Payment 700 /
        # Monthly Payment 200`) OR a "Request Price" label. We walk all
        # matches and keep the LAST plausible one — the carousel
        # template puts the asking price right before the title link.
        price: float | None = None
        currency: str | None = None
        price_label: str | None = None

        for pm in _PRICE_PATTERN.finditer(before):
            sym = pm.group("sym")
            code = pm.group("code")
            amt = pm.group("amount_sym") or pm.group("amount_code")
            if not amt:
                continue
            try:
                val = float(amt.replace(",", ""))
            except ValueError:
                continue
            if val < _MIN_PLAUSIBLE_PRICE or val > 50_000_000:
                continue
            price = val
            currency = (sym or code or currency or "").strip() or None

        # Finance-only listings (BHPH dealers) show Down / Monthly
        # instead of a sale price. Don't fail on these — capture the
        # finance terms as a label so the user sees actionable info.
        if price is None:
            fm = _FINANCE_TERMS_RE.search(before)
            if fm:
                price_label = f"Down ${fm.group(1)} / Mo ${fm.group(2)}"

        if price is None and price_label is None and _REQUEST_PRICE_RE.search(before):
            price_label = "Request price"

        # Image: last image URL in `before` from this domain.
        image: str | None = None
        for im in reversed(list(re.finditer(
            r'(?:data-lazy-src|data-src|src)="([^"]+\.(?:jpe?g|png|webp)[^"]*)"',
            before,
        ))):
            cand = im.group(1)
            if cand.startswith("data:"):
                continue
            image = cand
            break

        # Mileage / fuel / bedrooms / etc. — grid-view fragments after the URL
        # in Motors theme contain a short attribute strip. Best-effort grab.
        attrs: dict[str, str] = {}
        win = html[pos : pos + 600]
        for key, pat in (
            ("mileage",      r"Mileage[^\w]+([\d,]+\s*mi(?:les)?)"),
            ("fuel",         r"Fuel\s+type[^\w]+([A-Za-z]+)"),
            ("transmission", r"Transmission[^\w]+([A-Za-z]+)"),
            ("bedrooms",     r"([\d]+)\s+Bed(?:room)?s?"),
            ("bathrooms",    r"([\d]+)\s+Bath(?:room)?s?"),
        ):
            am = re.search(pat, win, re.I)
            if am:
                attrs[key] = am.group(1).strip()

        # Year from the title — cheap and universal for vehicle listings.
        year = None
        if title:
            ym = re.search(r"\b(19|20)\d{2}\b", title)
            if ym:
                year = ym.group(0)

        card = {
            "url": url,
            "title": title or _slug_to_title(url),
            "price": price,
            "price_label": price_label,
            "image": image,
            "currency": currency,
            "attrs": attrs,
            "year": year,
        }
        # First fully-populated card wins; otherwise keep the best
        # fallback and move on.
        if title and (price is not None or price_label):
            return card
        if fallback is None:
            fallback = card
    return fallback


def _slug_to_title(url: str) -> str:
    slug = url.rstrip("/").split("/")[-1]
    slug = re.sub(r"%[0-9a-f]{2}", " ", slug, flags=re.I)
    slug = slug.replace("-", " ")
    slug = re.sub(r"\s+(?:for\s+sale|near\s+me|buy\s+here\s+pay\s+here).*$", "", slug, flags=re.I)
    return slug.strip().title() or url


def _card_to_product(card: dict, base: str) -> dict:
    title = card["title"]
    attrs = card.get("attrs") or {}
    desc_bits = [title]
    if attrs.get("mileage"):
        desc_bits.append(f"Approximately {attrs['mileage']} on the odometer.")
    if attrs.get("fuel"):
        desc_bits.append(f"Runs on {attrs['fuel']}.")
    if attrs.get("transmission"):
        desc_bits.append(f"Transmission: {attrs['transmission']}.")
    if attrs.get("bedrooms"):
        desc_bits.append(f"{attrs['bedrooms']} bedrooms.")
    if attrs.get("bathrooms"):
        desc_bits.append(f"{attrs['bathrooms']} bathrooms.")
    desc_bits.append(f"View the full listing at {card['url']}.")
    description = " ".join(desc_bits)

    short_parts: list[str] = []
    if card.get("year"):
        short_parts.append(f"Year: {card['year']}")
    for k in ("mileage", "fuel", "transmission", "bedrooms", "bathrooms"):
        if attrs.get(k):
            short_parts.append(f"{k.title()}: {attrs[k]}")
    short = " · ".join(short_parts)

    tags: list[str] = ["Listing"]
    if card.get("price_label"):
        tags.append("Request price")
    if card.get("year"):
        tags.append(card["year"])

    return {
        "title": title,
        "handle": card["url"].rstrip("/").split("/")[-1],
        "sku": None,
        "brand": None,
        "price": card.get("price"),
        "compare_at_price": None,
        "currency": card.get("currency") or "USD",
        "short_description": short,
        "description": description,
        "categories": ["Listings"],
        "tags": tags,
        "images": [card["image"]] if card.get("image") else [],
        "variants": [],
        "in_stock": None if card.get("price_label") else True,
        "source_url": card["url"],
    }


def fetch_wp_listings_catalog(
    url: str,
    on_progress: Callable[[int, int | None], None] | None = None,
    max_products: int = 10000,
) -> list[dict]:
    """Scrape a WordPress site's listing-CPT inventory page(s) into our
    product shape. Handles Motors-theme vehicle dealers and the wider
    family of listings sites (real estate, jobs, classifieds) that lock
    their CPT out of the REST API.

    Strategy:
      1. Discover an inventory index page (we try /inventory/, /listings/,
         etc. in order; whichever 200s AND contains listing-shaped hrefs
         wins).
      2. Pull every unique listing detail URL from that page.
      3. For each URL, find its card markup in the inventory HTML and
         pull title / price / image / a few attributes from the surrounding
         ~900 chars.
      4. Paginate the index page via /page/N/ until we have enough or
         we run out of listings.

    Detail-page enrichment is intentionally skipped — these themes
    frequently 500 on individual listing URLs and the inventory page
    already carries everything we need.
    """
    base = normalize_base(url)
    headers = {"User-Agent": USER_AGENT}

    def page_url(index_path: str, page: int) -> str:
        if page <= 1:
            return urljoin(base, index_path)
        # Standard WP pagination: /inventory/page/2/
        return urljoin(base, index_path.rstrip("/") + f"/page/{page}/")

    # Pick the inventory index page — caller may have already pointed
    # us at a listing-collection URL, so try the supplied URL FIRST.
    candidates: list[str] = []
    supplied_path = urlparse(url).path or "/"
    if supplied_path and supplied_path != "/":
        candidates.append(supplied_path if supplied_path.endswith("/") else supplied_path + "/")
    for c in WP_LISTING_INDEX_CANDIDATES:
        if c not in candidates:
            candidates.append(c)

    products: list[dict] = []
    seen_urls: set[str] = set()

    with httpx.Client(follow_redirects=True, timeout=30.0, headers=headers) as c:
        # Step 1: find the first candidate that has listing URLs on it.
        chosen_index: str | None = None
        first_html: str = ""
        for cand in candidates:
            try:
                r = c.get(urljoin(base, cand))
            except Exception:
                continue
            if r.status_code != 200:
                continue
            urls = _find_listing_urls(r.text, base, limit=1)
            if urls:
                chosen_index = cand
                first_html = r.text
                break
        if not chosen_index:
            return products

        # Step 2 + 3: walk index pages, extract cards.
        page = 1
        html = first_html
        while len(products) < max_products:
            listing_urls = _find_listing_urls(html, base, limit=max_products - len(products) + 5)
            new_count = 0
            for lurl in listing_urls:
                if lurl in seen_urls:
                    continue
                seen_urls.add(lurl)
                card = _extract_listing_card(html, lurl)
                if not card:
                    continue
                products.append(_card_to_product(card, base))
                new_count += 1
                if len(products) >= max_products:
                    break
            if on_progress:
                on_progress(len(products), None)
            if len(products) >= max_products or new_count == 0:
                break
            # Step 4: paginate.
            page += 1
            try:
                r = c.get(page_url(chosen_index, page))
            except Exception:
                break
            if r.status_code != 200:
                break
            html = r.text

    return products
