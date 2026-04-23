"""RQ task: process a crawl — detect platform, fetch catalog (or single product),
run AI cleanup on single mode, persist products."""
from __future__ import annotations

from datetime import datetime

from .db import SessionLocal
from .models import Crawl, Product
from .platforms import detect_platform, fetch_shopify_catalog, fetch_woocommerce_catalog
from .scraper import scrape_url
from .ai import clean_product


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


def process_crawl(crawl_id: str) -> None:
    _update(crawl_id, status="processing", progress={"step": "detecting"})
    with SessionLocal() as s:
        c = s.get(Crawl, crawl_id)
        if not c:
            return
        url = c.url
        platform = c.platform
        mode = c.mode

    try:
        if platform == "auto":
            platform = detect_platform(url)
            _update(crawl_id, platform=platform)

        if mode == "catalog" and platform == "shopify":
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_shopify_catalog(url, on_progress=progress)
        elif mode == "catalog" and platform == "woocommerce":
            def progress(done: int, total: int | None):
                _update(crawl_id, progress={"step": "fetching", "done": done, "total": total})
            products = fetch_woocommerce_catalog(url, on_progress=progress)
        else:
            # Single product (mode=single OR catalog fallback for "other")
            _update(crawl_id, progress={"step": "fetching"})
            raw = scrape_url(url, on_progress=lambda s, m: _update(crawl_id, progress={"step": s, **(m or {})}))
            _update(crawl_id, progress={"step": "cleaning"})
            cleaned = clean_product(raw)
            products = [cleaned]
            mode = "single"
            _update(crawl_id, mode=mode)

        _update(crawl_id, progress={"step": "saving", "done": 0, "total": len(products)}, total=len(products))
        for i, p in enumerate(products, start=1):
            _insert_product(crawl_id, p)
            if i % 10 == 0 or i == len(products):
                _update(crawl_id, progress={"step": "saving", "done": i, "total": len(products)})

        _update(crawl_id, status="done", progress={"step": "done", "done": len(products), "total": len(products)}, error=None)
    except Exception as e:
        _update(crawl_id, status="failed", error=str(e), progress={"step": "failed"})
        raise
