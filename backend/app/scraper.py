"""Playwright scraper. Fetches a product page and extracts structured fields
with a generic extractor that works across most e-commerce sites (WooCommerce,
Shopify, JSON-LD Product schema, OpenGraph fallbacks)."""
from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from .config import get_settings


PRICE_RE = re.compile(r"([\$£€])\s*([0-9][0-9,]*\.?\d{0,2})")


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    m = PRICE_RE.search(text)
    if not m:
        m2 = re.search(r"([0-9][0-9,]*\.?\d{0,2})", text)
        if not m2:
            return None
        try:
            return float(m2.group(1).replace(",", ""))
        except ValueError:
            return None
    try:
        return float(m.group(2).replace(",", ""))
    except ValueError:
        return None


def _json_ld_products(soup: BeautifulSoup) -> list[dict]:
    out: list[dict] = []
    for tag in soup.find_all("script", type="application/ld+json"):
        raw = tag.string or tag.get_text() or ""
        if not raw.strip():
            continue
        try:
            data = json.loads(raw)
        except Exception:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if isinstance(item, dict):
                t = item.get("@type")
                types = t if isinstance(t, list) else [t]
                if any(str(x).lower() == "product" for x in types):
                    out.append(item)
                graph = item.get("@graph")
                if isinstance(graph, list):
                    for g in graph:
                        gt = g.get("@type") if isinstance(g, dict) else None
                        gtypes = gt if isinstance(gt, list) else [gt]
                        if any(str(x).lower() == "product" for x in gtypes):
                            out.append(g)
    return out


def _from_json_ld(ld: dict, base_url: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    out["title"] = ld.get("name")
    out["description"] = ld.get("description")
    out["sku"] = ld.get("sku") or ld.get("mpn")
    brand = ld.get("brand")
    if isinstance(brand, dict):
        out["brand"] = brand.get("name")
    elif isinstance(brand, str):
        out["brand"] = brand

    images: list[str] = []
    img = ld.get("image")
    if isinstance(img, str):
        images = [img]
    elif isinstance(img, list):
        images = [i for i in img if isinstance(i, str)]
    out["images"] = [urljoin(base_url, i) for i in images]

    offers = ld.get("offers")
    price = None
    currency = None
    availability = None
    if isinstance(offers, dict):
        price = offers.get("price") or offers.get("lowPrice")
        currency = offers.get("priceCurrency")
        availability = offers.get("availability")
    elif isinstance(offers, list) and offers:
        first = offers[0]
        if isinstance(first, dict):
            price = first.get("price") or first.get("lowPrice")
            currency = first.get("priceCurrency")
            availability = first.get("availability")
    try:
        out["price"] = float(price) if price is not None else None
    except (TypeError, ValueError):
        out["price"] = _parse_price(str(price)) if price else None
    out["currency"] = currency
    if availability:
        out["in_stock"] = "instock" in str(availability).lower() or "in_stock" in str(availability).lower()
    return out


def _from_html(soup: BeautifulSoup, base_url: str) -> dict[str, Any]:
    out: dict[str, Any] = {}

    title_el = soup.select_one(
        "h1.product_title, h1.product-title, h1.entry-title, h1[itemprop=name], h1"
    )
    if title_el:
        out["title"] = title_el.get_text(strip=True)

    if not out.get("title"):
        og = soup.find("meta", property="og:title")
        if og and og.get("content"):
            out["title"] = og["content"].strip()

    og_desc = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", property="og:description"
    )
    if og_desc and og_desc.get("content"):
        out["description"] = og_desc["content"].strip()

    desc_el = soup.select_one(
        "#tab-description, .woocommerce-Tabs-panel--description, "
        ".product__description, [itemprop=description], .product-description"
    )
    if desc_el:
        txt = desc_el.get_text(separator=" ", strip=True)
        if txt and len(txt) > len(out.get("description", "")):
            out["description"] = txt

    price_el = soup.select_one(
        "p.price, .price, [itemprop=price], .product__price, .money"
    )
    if price_el:
        price = _parse_price(price_el.get_text(" ", strip=True))
        if price:
            out["price"] = price

    meta_price = soup.find("meta", property="product:price:amount") or soup.find(
        "meta", attrs={"itemprop": "price"}
    )
    if meta_price and meta_price.get("content") and not out.get("price"):
        try:
            out["price"] = float(meta_price["content"])
        except ValueError:
            pass

    meta_curr = soup.find("meta", property="product:price:currency") or soup.find(
        "meta", attrs={"itemprop": "priceCurrency"}
    )
    if meta_curr and meta_curr.get("content"):
        out["currency"] = meta_curr["content"]

    images: list[str] = []
    for img in soup.select(
        ".woocommerce-product-gallery img, .product__media img, "
        "[itemprop=image], .product-gallery img, picture img"
    ):
        src = (
            img.get("data-zoom-src")
            or img.get("data-large_image")
            or img.get("data-src")
            or img.get("src")
        )
        if src and src.startswith(("http://", "https://", "//", "/")):
            full = urljoin(base_url, src)
            if "loading" not in full and full not in images:
                images.append(full)
    if not images:
        og_img = soup.find("meta", property="og:image")
        if og_img and og_img.get("content"):
            images.append(urljoin(base_url, og_img["content"]))
    if images:
        out["images"] = images

    sku_el = soup.select_one(".sku, [itemprop=sku]")
    if sku_el:
        out["sku"] = sku_el.get_text(strip=True)

    cats: list[str] = []
    for a in soup.select(".posted_in a, .product_meta .posted_in a, .breadcrumb a"):
        t = a.get_text(strip=True)
        if t and t.lower() not in ("home", "shop"):
            cats.append(t)
    if cats:
        out["categories"] = cats

    stock_el = soup.select_one(".stock, p.stock, [itemprop=availability]")
    if stock_el:
        txt = stock_el.get_text(" ", strip=True).lower()
        out["in_stock"] = not ("out of stock" in txt or "sold out" in txt)

    return out


def fetch_html(url: str) -> str:
    """Render `url` headlessly and return the fully-loaded HTML string."""
    settings = get_settings()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            context = browser.new_context(
                user_agent=settings.scraper_user_agent,
                viewport={"width": 1280, "height": 900},
            )
            page = context.new_page()
            page.set_default_timeout(settings.scraper_timeout_ms)
            page.goto(url, wait_until="domcontentloaded")
            try:
                page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            return page.content()
        finally:
            browser.close()


def extract_heuristic(html: str, url: str) -> dict[str, Any]:
    """Extract product data from HTML using JSON-LD + generic HTML heuristics.
    Always returns the canonical shape; fields it can't find are left as None /
    empty so a secondary extractor (AI-config) can fill the gaps."""
    soup = BeautifulSoup(html, "lxml")

    data: dict[str, Any] = {}
    for ld in _json_ld_products(soup):
        for k, v in _from_json_ld(ld, url).items():
            if v and not data.get(k):
                data[k] = v

    for k, v in _from_html(soup, url).items():
        if v and not data.get(k):
            data[k] = v

    data.setdefault("title", None)
    data.setdefault("description", None)
    data.setdefault("price", None)
    data.setdefault("currency", "USD")
    data.setdefault("images", [])
    data.setdefault("sku", None)
    data.setdefault("categories", [])
    data.setdefault("in_stock", None)
    data["source_url"] = url
    return data


def scrape_url(url: str, on_progress=None) -> dict[str, Any]:
    """Legacy one-shot: fetch + extract heuristically. Used by worker only when
    the AI-config path is disabled. `on_progress(step, meta)` optional."""

    def emit(step: str, **meta):
        if on_progress:
            try:
                on_progress(step, meta)
            except Exception:
                pass

    emit("fetching")
    html = fetch_html(url)
    emit("parsing")
    data = extract_heuristic(html, url)
    emit("extracting")
    return data
