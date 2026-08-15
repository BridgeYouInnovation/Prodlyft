"""RQ task: process a crawl — detect platform, fetch catalog (or single product),
run AI cleanup on single mode, persist products."""
from __future__ import annotations

from datetime import datetime

from .db import SessionLocal
from .errors import SiteBlockedError
from .models import Crawl, Product
from .platforms import (
    detect_platform,
    fetch_shopify_catalog,
    fetch_woocommerce_catalog,
    fetch_wp_listings_catalog,
)
from .scraper import fetch_html, extract_heuristic
from .ai import clean_product
from .ai_scraper import (
    domain_of,
    get_or_generate_config,
    extract_with_config,
)
from .tokens import EXTRACT_PRODUCT, get_balance, try_debit
from . import firecrawl


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
        user_id = c.user_id

    # Token enforcement — clamp user_max to current balance.
    #   balance == -1 → admin / unlimited, no clamp.
    #   balance == 0  → fail loudly so the UI shows a top-up CTA.
    #   balance >  0  → clamp the requested ceiling so we never start a job
    #                   destined to run out mid-flight.
    if user_id:
        balance = get_balance(user_id)
        if balance == 0:
            _update(
                crawl_id,
                status="failed",
                error="Out of credits. Top up your token balance to run another extract.",
                progress={"step": "no_credits", "balance": 0},
            )
            return
        if balance > 0:
            user_max = min(user_max, balance) if user_max else balance

    try:
        if platform == "auto":
            platform = detect_platform(url)
            _update(crawl_id, platform=platform)

        # When a category filter is set we need to fetch the full catalog so we
        # can filter post-hoc (Shopify's /products.json has no category query
        # param). Without a filter we can stop fetching once we have enough.
        fetch_cap = FETCH_SAFETY_CAP if category_filter else (user_max or FETCH_SAFETY_CAP)

        # If the user asked for a catalog but the platform detector
        # couldn't identify the storefront, try the AI-driven catalog
        # discovery path (Wix Stores, Squarespace Commerce, custom
        # storefronts etc.). The LLM looks at the homepage and tells
        # us where to find product pages — see ai_catalog.py.
        # We only fail loudly if that ALSO comes up empty.
        if mode == "catalog" and platform == "other":
            from .ai_catalog import fetch_ai_catalog
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "discovering" if done == 0 else "fetching", "done": done, "total": total})
            _update(crawl_id, progress={"step": "discovering"})
            products = fetch_ai_catalog(url, on_progress=progress, max_products=fetch_cap)
            platform = "ai_catalog"  # so downstream logs/UI reflect what actually ran

        elif mode == "catalog" and platform == "shopify":
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_shopify_catalog(url, on_progress=progress, max_products=fetch_cap)
        elif mode == "catalog" and platform == "woocommerce":
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_woocommerce_catalog(url, on_progress=progress, max_products=fetch_cap)
        elif mode == "catalog" and platform == "wp_listings":
            # WordPress site with a non-Woo listing CPT (Motors theme,
            # real estate themes, job boards…). Scrape the inventory
            # index page directly — see platforms.fetch_wp_listings_catalog.
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_wp_listings_catalog(url, on_progress=progress, max_products=fetch_cap)
        else:
            # Single product — rule-based heuristics first, AI-guided config
            # as a fallback when heuristics don't find a title or price.
            _update(crawl_id, progress={"step": "fetching"})
            print(f"[worker] fetching {url}", flush=True)
            html = fetch_html(url)
            print(f"[worker] fetched html_chars={len(html)}", flush=True)

            _update(crawl_id, progress={"step": "parsing"})
            raw = extract_heuristic(html, url)
            print(
                f"[worker] heuristic: title={raw.get('title')!r} price={raw.get('price')} images={len(raw.get('images') or [])}",
                flush=True,
            )

            if not raw.get("title") or raw.get("price") is None:
                print("[worker] heuristic gaps → trying AI config", flush=True)
                _update(crawl_id, progress={"step": "config"})
                cfg, from_cache = get_or_generate_config(url, html)
                print(f"[worker] ai config: hit_cache={from_cache} got_cfg={bool(cfg)}", flush=True)
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
                    print(
                        f"[worker] ai extract: title={ai_raw.get('title')!r} price={ai_raw.get('price')} images={len(ai_raw.get('images') or [])}",
                        flush=True,
                    )
                    # Merge: AI fills in only the fields the heuristic missed.
                    for k, v in ai_raw.items():
                        if v and not raw.get(k):
                            raw[k] = v

            # Last-resort hosted fallback. Pay-per-page, so only fires when
            # the free paths above gave us neither a title nor a price.
            if (not raw.get("title") or raw.get("price") is None) and firecrawl.is_enabled():
                print("[worker] still empty → trying Firecrawl", flush=True)
                _update(crawl_id, progress={"step": "firecrawl"})
                fc_raw = firecrawl.scrape(url)
                print(
                    f"[worker] firecrawl: got={bool(fc_raw)} title={(fc_raw or {}).get('title')!r} price={(fc_raw or {}).get('price')}",
                    flush=True,
                )
                if fc_raw:
                    for k, v in fc_raw.items():
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

        # Mark "done with nothing useful" as failed so the user gets a clear
        # message instead of an empty Extracts page that looks like success.
        if mode == "catalog" and len(products) == 0:
            if platform == "wp_listings":
                msg = (
                    "No listings found on this WordPress site. We tried the "
                    "common inventory paths (/inventory/, /listings/, etc.) "
                    "but couldn't extract any listing cards. The theme may "
                    "render listings entirely with JavaScript or be using "
                    "a non-standard URL structure."
                )
            elif platform == "ai_catalog":
                msg = (
                    "We tried AI-driven catalog discovery on this site but "
                    "couldn't find product pages we could extract. The site "
                    "may render its catalog entirely with JavaScript, hide "
                    "it behind a login, or use a structure our model didn't "
                    "recognise. Try pasting a specific product URL with "
                    "platform=Other for a single-product extract."
                )
            else:
                msg = (
                    f"No products returned from this {platform} store. "
                    "Either the public catalog API is disabled or the host blocked us. "
                    "Try the URL with platform=Other for a single-product extract."
                )
            _update(crawl_id, status="failed", error=msg, progress={"step": "empty", "total": 0}, total=0)
            return
        if mode == "single" and len(products) == 1:
            only = products[0]
            if not only.get("title") and only.get("price") is None:
                msg = (
                    "Couldn't extract any product data from this page. "
                    "The site likely blocks headless browsers or uses a non-standard layout. "
                    + ("Configure FIRECRAWL_API_KEY for a stealth-mode fallback." if not firecrawl.is_enabled() else "Even Firecrawl couldn't read it.")
                )
                _update(crawl_id, status="failed", error=msg, progress={"step": "empty", "total": 0}, total=0)
                return

        _update(crawl_id, progress={"step": "saving", "done": 0, "total": len(products)}, total=len(products))
        # Per-product token debit. Charges 1 token only after a product is
        # successfully saved. If the balance hits 0 mid-loop, stop saving
        # and end the crawl gracefully — the user keeps everything we did
        # save, gets a clear "ran out of credits" message and a top-up CTA.
        saved = 0
        ran_out = False
        for i, p in enumerate(products, start=1):
            ok, _bal = (True, -1) if not user_id else try_debit(
                user_id,
                EXTRACT_PRODUCT,
                "extract",
                ref_type="crawl",
                ref_id=crawl_id,
            )
            if not ok:
                ran_out = True
                break
            _insert_product(crawl_id, p)
            saved = i
            if i % 10 == 0 or i == len(products):
                _update(crawl_id, progress={"step": "saving", "done": i, "total": len(products)})

        if ran_out:
            msg = (
                f"Ran out of credits after {saved} of {len(products)} products. "
                "Top up your token balance to extract the rest."
            )
            _update(
                crawl_id,
                status="done",
                error=msg,
                progress={
                    "step": "ran_out_of_credits",
                    "done": saved,
                    "total": len(products),
                    "partial": True,
                },
                total=saved,
            )
            return

        _update(
            crawl_id,
            status="done",
            progress={"step": "done", "done": saved, "total": saved},
            total=saved,
            error=None,
        )
    except SiteBlockedError as e:
        if e.mitigator:
            msg = (
                f"{e.host} is protected by {e.mitigator.title()} bot "
                f"protection and returned HTTP {e.status} to our scraper. "
                "We can't extract from sites that actively challenge "
                "automated traffic."
            )
        else:
            msg = (
                f"{e.host} blocked our scraper (HTTP {e.status}). "
                "The site's anti-bot protection stopped us from reading it."
            )
        _update(
            crawl_id,
            status="failed",
            error=msg,
            progress={"step": "blocked", "host": e.host, "mitigator": e.mitigator, "status": e.status},
        )
        return
    except Exception as e:
        _update(crawl_id, status="failed", error=str(e), progress={"step": "failed"})
        raise
