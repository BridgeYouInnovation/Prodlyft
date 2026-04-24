"""AI-assisted scraper for sites that aren't matched by rule-based detection.

Flow on a cache miss:
  1. Playwright fetches the page HTML (caller passes it in).
  2. We strip scripts/styles/svg to reduce token spend.
  3. Claude returns a JSON config describing CSS selectors for each field.
  4. We persist the config keyed by domain in `scrape_configs`.
  5. A generic BeautifulSoup extractor runs the config against the HTML.

On a cache hit, steps 1 + 5 only — no AI call.
"""
from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from .config import get_settings
from .db import SessionLocal
from .models import ScrapeConfig


# ---------- Domain helpers ----------

def domain_of(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


# ---------- HTML trimming before sending to the model ----------

_MAX_HTML_CHARS = 30_000  # ~7.5k input tokens


def _trim_html(html: str, max_chars: int = _MAX_HTML_CHARS) -> str:
    """Drop noise (styles/svg/scripts except JSON-LD), then truncate."""
    soup = BeautifulSoup(html, "lxml")
    for t in soup(["style", "noscript", "svg"]):
        t.decompose()
    for t in soup.find_all("script"):
        if (t.get("type") or "").lower() != "application/ld+json":
            t.decompose()
    text = str(soup)
    return text[:max_chars]


# ---------- Claude call ----------

_SYSTEM_PROMPT = """You analyse HTML from e-commerce product pages and return a JSON recipe a BeautifulSoup-based extractor can execute.

Respond with EXACTLY this JSON shape (no prose, no markdown fences):
{
  "platform_hint": "shopify | woocommerce | bigcommerce | squarespace | magento | custom | unknown",
  "fields": {
    "title":            [ "css selector", ... ],
    "price":            [ "css selector", ... ],
    "compare_at_price": [ "css selector", ... ],
    "description":      [ "css selector", ... ],
    "short_description":[ "css selector", ... ],
    "sku":              [ "css selector", ... ],
    "brand":            [ "css selector", ... ],
    "categories":       [ "css selector", ... ],
    "images":           [ "css selector matching <img>", ... ]
  },
  "image_attr": "src | data-src | data-original | data-lazy-src | data-zoom-src"
}

Rules:
- CSS selectors only (BeautifulSoup .select / .select_one).
- Each field is an ordered list of fallback selectors. Earlier = preferred.
- For `images`, selectors MUST match <img> elements. Pick the attribute that holds the real URL (often `src`, sometimes `data-src` on lazy-loaded sites).
- Prefer selectors unique to the field: classes, itemprop=, data-* attrs, microdata, or OpenGraph metas via attribute selectors (e.g. `meta[property='og:title']`).
- If a field isn't present in the HTML, return an empty list.
- Never invent selectors — only use ones visible in the provided HTML."""


def _call_claude(url: str, html: str) -> dict | None:
    settings = get_settings()
    if not settings.openrouter_api_key:
        return None

    trimmed = _trim_html(html)
    user_msg = f"URL: {url}\n\nHTML ({len(trimmed)} chars):\n{trimmed}"

    payload = {
        "model": settings.openrouter_scraper_model,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }
    try:
        with httpx.Client(timeout=90.0) as client:
            r = client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openrouter_api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://prodlyft.app",
                    "X-Title": "Prodlyft",
                },
                json=payload,
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
    except Exception:
        return None

    # Parse JSON, tolerating the odd prose-wrapper.
    try:
        parsed = json.loads(content)
    except Exception:
        m = re.search(r"\{.*\}", content or "", re.DOTALL)
        if not m:
            return None
        try:
            parsed = json.loads(m.group(0))
        except Exception:
            return None

    if not isinstance(parsed, dict) or not isinstance(parsed.get("fields"), dict):
        return None
    return parsed


# ---------- Cache read / write ----------

def get_cached_config(domain: str) -> dict | None:
    with SessionLocal() as s:
        row = s.get(ScrapeConfig, domain)
        if row is None:
            return None
        row.hit_count = (row.hit_count or 0) + 1
        s.commit()
        return row.config


def save_config(domain: str, platform: str, config: dict) -> None:
    with SessionLocal() as s:
        existing = s.get(ScrapeConfig, domain)
        if existing is None:
            s.add(ScrapeConfig(domain=domain, platform=platform or "custom", config=config, hit_count=0))
        else:
            existing.platform = platform or "custom"
            existing.config = config
        s.commit()


def get_or_generate_config(url: str, html: str) -> tuple[dict | None, bool]:
    """Returns (config, from_cache). Config is None if AI failed."""
    domain = domain_of(url)
    cached = get_cached_config(domain)
    if cached is not None:
        return cached, True

    cfg = _call_claude(url, html)
    if not cfg:
        return None, False
    save_config(domain, cfg.get("platform_hint") or "custom", cfg)
    return cfg, False


# ---------- Generic extractor ----------

_PRICE_RE = re.compile(r"([\$£€])\s*([0-9][0-9,]*\.?\d{0,2})")


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    m = _PRICE_RE.search(text)
    if m:
        try:
            return float(m.group(2).replace(",", ""))
        except ValueError:
            return None
    m2 = re.search(r"([0-9]+\.?\d*)", text.replace(",", ""))
    if m2:
        try:
            return float(m2.group(1))
        except ValueError:
            return None
    return None


def _norm(selectors: Any) -> list[str]:
    if selectors is None:
        return []
    if isinstance(selectors, str):
        return [selectors]
    if isinstance(selectors, list):
        return [s for s in selectors if isinstance(s, str) and s.strip()]
    return []


def extract_with_config(html: str, config: dict, base_url: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    fields = config.get("fields") or {}
    image_attr = (config.get("image_attr") or "src").strip()

    def first_text(selectors: Any) -> str | None:
        for sel in _norm(selectors):
            try:
                el = soup.select_one(sel)
            except Exception:
                continue
            if el is None:
                continue
            # Meta tags: pull content rather than text.
            if el.name == "meta":
                c = el.get("content")
                if c:
                    return c.strip()
                continue
            txt = el.get_text(" ", strip=True)
            if txt:
                return txt
        return None

    def all_text(selectors: Any) -> list[str]:
        out: list[str] = []
        for sel in _norm(selectors):
            try:
                for el in soup.select(sel):
                    txt = (el.get("content") if el.name == "meta" else el.get_text(" ", strip=True)) or ""
                    txt = txt.strip()
                    if txt and txt not in out:
                        out.append(txt)
            except Exception:
                continue
        return out

    def all_images(selectors: Any) -> list[str]:
        out: list[str] = []
        for sel in _norm(selectors):
            try:
                for img in soup.select(sel):
                    src = (
                        img.get(image_attr)
                        or img.get("data-src")
                        or img.get("data-zoom-src")
                        or img.get("data-large_image")
                        or img.get("src")
                    )
                    if not src:
                        continue
                    if src.startswith(("http://", "https://", "//", "/")):
                        full = urljoin(base_url, src)
                        if "loading" not in full and full not in out:
                            out.append(full)
            except Exception:
                continue
        return out

    title = first_text(fields.get("title"))
    description = first_text(fields.get("description"))
    short_description = first_text(fields.get("short_description"))
    sku = first_text(fields.get("sku"))
    brand = first_text(fields.get("brand"))
    price_text = first_text(fields.get("price"))
    compare_text = first_text(fields.get("compare_at_price"))
    categories = all_text(fields.get("categories"))
    images = all_images(fields.get("images"))

    # Last-resort OG image fallback.
    if not images:
        og = soup.find("meta", property="og:image")
        if og and og.get("content"):
            images.append(urljoin(base_url, og["content"]))

    return {
        "title": title,
        "description": description,
        "short_description": short_description,
        "sku": sku,
        "brand": brand,
        "price": _parse_price(price_text),
        "compare_at_price": _parse_price(compare_text),
        "currency": "USD",
        "categories": categories,
        "tags": [],
        "images": images,
        "in_stock": None,
        "source_url": base_url,
    }
