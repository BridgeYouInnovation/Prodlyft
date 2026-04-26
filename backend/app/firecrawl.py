"""Firecrawl fallback for the 'Other' scrape path.

Only invoked when the local Playwright + AI-config attempt couldn't pull a
title or price. Firecrawl's hosted browser handles stealth, proxy rotation,
and JS-rendered SPAs that our headless Chromium gets bot-challenged on.

Costs ~$0.006 per page (Firecrawl's published price), so this is gated by
two checks: (1) the user must have configured FIRECRAWL_API_KEY, (2) we
only fall through to it after the cheaper paths have failed.
"""
from __future__ import annotations

import json
from typing import Any
from urllib.parse import urljoin

import httpx

from .config import get_settings


_PRODUCT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "title":             {"type": "string"},
        "short_description": {"type": "string"},
        "description":       {"type": "string"},
        "price":             {"type": "number"},
        "compare_at_price":  {"type": "number"},
        "currency":          {"type": "string"},
        "sku":               {"type": "string"},
        "brand":             {"type": "string"},
        "categories":        {"type": "array", "items": {"type": "string"}},
        "tags":              {"type": "array", "items": {"type": "string"}},
        "images":            {"type": "array", "items": {"type": "string"}},
        "in_stock":          {"type": "boolean"},
    },
    "required": ["title"],
}


_PROMPT = (
    "Extract structured product data from the page. If multiple products "
    "are shown, pick the main / focused one. Use absolute URLs for images. "
    "Numeric `price` and `compare_at_price` only — strip currency symbols "
    "and put the ISO code in `currency` (USD if unknown)."
)


def is_enabled() -> bool:
    return bool(get_settings().firecrawl_api_key)


def scrape(url: str) -> dict | None:
    """Returns a normalized product dict or None on any failure."""
    settings = get_settings()
    if not settings.firecrawl_api_key:
        return None

    base = settings.firecrawl_base_url.rstrip("/")
    payload = {
        "url": url,
        "formats": ["json"],
        "onlyMainContent": True,
        "jsonOptions": {
            "schema": _PRODUCT_SCHEMA,
            "prompt": _PROMPT,
        },
    }
    try:
        with httpx.Client(timeout=120.0) as c:
            r = c.post(
                f"{base}/v1/scrape",
                headers={
                    "Authorization": f"Bearer {settings.firecrawl_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if r.status_code != 200:
                print(f"[firecrawl] http={r.status_code} body={r.text[:240]}", flush=True)
                return None
            body = r.json()
    except Exception as e:
        print(f"[firecrawl] exception: {e}", flush=True)
        return None

    if not body.get("success"):
        print(f"[firecrawl] !success body={json.dumps(body)[:240]}", flush=True)
        return None

    data = body.get("data") or {}
    extracted = data.get("json") or data.get("extract") or {}
    if not isinstance(extracted, dict):
        return None

    # Normalize image URLs to absolute.
    images = extracted.get("images") or []
    if isinstance(images, list):
        images = [urljoin(url, str(s)) for s in images if isinstance(s, str)]
    else:
        images = []

    return {
        "title": extracted.get("title"),
        "short_description": extracted.get("short_description"),
        "description": extracted.get("description"),
        "price": _to_number(extracted.get("price")),
        "compare_at_price": _to_number(extracted.get("compare_at_price")),
        "currency": extracted.get("currency") or "USD",
        "sku": extracted.get("sku"),
        "brand": extracted.get("brand"),
        "categories": extracted.get("categories") or [],
        "tags": extracted.get("tags") or [],
        "images": images,
        "in_stock": extracted.get("in_stock"),
        "source_url": url,
    }


def _to_number(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
