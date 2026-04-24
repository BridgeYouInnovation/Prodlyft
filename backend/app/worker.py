"""RQ task: process a crawl — detect platform, fetch catalog (or single product),
run AI cleanup on single mode, persist products."""
from __future__ import annotations

from datetime import datetime

from .db import SessionLocal
from .models import Crawl, Product
from .platforms import detect_platform, fetch_shopify_catalog, fetch_woocommerce_catalog
from .scraper import fetch_html, extract_heuristic
from .ai import clean_product
from .ai_scraper import (
    domain_of,
    get_or_generate_config,
    extract_with_config,
)


# Safety cap — the most products we'll ever fetch from a single storefront in
# one go, regardless of user's max_products setting. Prevents runaway crawls on
# very large stores.
FETCH_SAFETY_CAP = 5000


def _update(crawl_id: str, **fields):
    with SessionLocal() as s:
        c = s.get(Crawl, crawl_id)
        if not c:
            return
        for k, v in fields.items():
            setattr(c, k, v)
        c.updated_at = datetime.utcnow()
        s.commit()


def _insert_product(crawl_id: str, data: dict) -> None:
    with SessionLocal() as s:
        p = Product(
            crawl_id=crawl_id,
            title=data.get("title"),
            handle=data.get("handle"),
            sku=data.get("sku"),
            brand=data.get("brand"),
            price=data.get("price"),
            compare_at_price=data.get("compare_at_price"),
            currency=data.get("currency") or "USD",
            short_description=data.get("short_description"),
            description=data.get("description"),
            categories=data.get("categories") or [],
            tags=data.get("tags") or [],
            images=data.get("images") or [],
            variants=data.get("variants") or [],
            in_stock=data.get("in_stock"),
            source_url=data.get("source_url"),
        )
        s.add(p)
        s.commit()


def _matches_category(product: dict, keyword: str) -> bool:
    """Case-insensitive substring match against any of the product's categories
    or tags. Empty keyword matches everything (caller should early-return)."""
    needle = keyword.lower()
    for c in product.get("categories") or []:
        if c and needle in c.lower():
            return True
    for t in product.get("tags") or []:
        if t and needle in t.lower():
            return True
    return False


def process_crawl(crawl_id: str) -> None:
    _update(crawl_id, status="processing", progress={"step": "detecting"})
    with SessionLocal() as s:
        c = s.get(Crawl, crawl_id)
        if not c:
            return
        url = c.url
        platform = c.platform
        mode = c.mode
        user_max = c.max_products
        category_filter = (c.category_filter or "").strip()

    try:
        if platform == "auto":
            platform = detect_platform(url)
            _update(crawl_id, platform=platform)

        # When a category filter is set we need to fetch the full catalog so we
        # can filter post-hoc (Shopify's /products.json has no category query
        # param). Without a filter we can stop fetching once we have enough.
        fetch_cap = FETCH_SAFETY_CAP if category_filter else (user_max or FETCH_SAFETY_CAP)

        if mode == "catalog" and platform == "shopify":
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_shopify_catalog(url, on_progress=progress, max_products=fetch_cap)
        elif mode == "catalog" and platform == "woocommerce":
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_woocommerce_catalog(url, on_progress=progress, max_products=fetch_cap)
        else:
            # Single product — rule-based heuristics first, AI-guided config
            # as a fallback when heuristics don't find a title or price.
            _update(crawl_id, progress={"step": "fetching"})
            html = fetch_html(url)
            _update(crawl_id, progress={"step": "parsing"})
            raw = extract_heuristic(html, url)

            if not raw.get("title") or raw.get("price") is None:
                _update(crawl_id, progress={"step": "config"})
                cfg, from_cache = get_or_generate_config(url, html)
                if cfg:
                    _update(
                        crawl_id,
                        progress={
                            "step": "extracting",
                            "domain": domain_of(url),
                            "from_cache": from_cache,
                        },
                    )
                    ai_raw = extract_with_config(html, cfg, url)
                    # Merge: AI fills in only the fields the heuristic missed.
                    for k, v in ai_raw.items():
                        if v and not raw.get(k):
                            raw[k] = v

            _update(crawl_id, progress={"step": "cleaning"})
            cleaned = clean_product(raw)
            products = [cleaned]
            mode = "single"
            _update(crawl_id, mode=mode)

        # Apply category filter then user-specified cap.
        if category_filter:
            _update(crawl_id, progress={"step": "filtering", "done": 0, "total": len(products)})
            products = [p for p in products if _matches_category(p, category_filter)]
        if user_max and len(products) > user_max:
            products = products[:user_max]

        _update(crawl_id, progress={"step": "saving", "done": 0, "total": len(products)}, total=len(products))
        for i, p in enumerate(products, start=1):
            _insert_product(crawl_id, p)
            if i % 10 == 0 or i == len(products):
                _update(crawl_id, progress={"step": "saving", "done": i, "total": len(products)})

        _update(crawl_id, status="done", progress={"step": "done", "done": len(products), "total": len(products)}, error=None)
    except Exception as e:
        _update(crawl_id, status="failed", error=str(e), progress={"step": "failed"})
        raise
