"""Scrapfly-backed 'unlocker' fallback for sites Firecrawl can't reach.

Firecrawl handles most bot-challenged sites, but a handful of storefronts
(Cloudflare Bot Management with 'JS Challenge + Managed Challenge', or
Cloudflare Enterprise Bot Fight Mode) still return interstitials to it.
Scrapfly's ASP (Anti-Scraping Protection) mode uses residential IPs,
solves the JS challenge with a real browser, and returns the actual page
HTML — enough to get past Cloudflare + DataDome + Imperva on nearly
everything we've tested.

Costs ~1–5 API credits per request (Scrapfly's "asp+render_js" tier),
which is roughly $0.005–$0.025 depending on the plan. Gated behind
SCRAPFLY_API_KEY and only fires after the free-tier paths (httpx,
Playwright, Firecrawl) have all failed on the current URL.
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from .config import get_settings


def is_enabled() -> bool:
    return bool(get_settings().scrapfly_api_key)


def _call(url: str, timeout: float = 90.0) -> dict | None:
    """POST to Scrapfly's /scrape endpoint with ASP + JS rendering on.
    Returns the parsed response envelope, or None on any transport /
    upstream failure."""
    settings = get_settings()
    if not settings.scrapfly_api_key:
        return None

    base = settings.scrapfly_base_url.rstrip("/")
    params = {
        "key": settings.scrapfly_api_key,
        "url": url,
        # ASP is the whole point of using Scrapfly over Firecrawl.
        "asp": "true",
        # JS rendering, because Cloudflare's challenge is JS-based and
        # any product-page hydration also needs a browser.
        "render_js": "true",
        # US residential proxies — matches most storefronts' target
        # market and avoids geoblocking on US-only shops.
        "country": "us",
        "proxy_pool": "public_residential_pool",
    }
    try:
        with httpx.Client(timeout=timeout) as c:
            r = c.get(f"{base}/scrape", params=params)
    except Exception as e:
        print(f"[unlocker] transport exception: {e}", flush=True)
        return None

    if r.status_code != 200:
        # Scrapfly encodes upstream errors as JSON with a `result` block,
        # so a non-200 here is a Scrapfly-side issue (quota, auth, bad
        # params). Log enough to debug without leaking the API key.
        print(
            f"[unlocker] scrapfly http={r.status_code} body={r.text[:280]}",
            flush=True,
        )
        return None
    try:
        return r.json()
    except Exception as e:
        print(f"[unlocker] json decode failed: {e}", flush=True)
        return None


def _extract_content(envelope: dict, url: str) -> str | None:
    result = envelope.get("result") or {}
    status = result.get("status_code")
    content = result.get("content")
    if isinstance(status, int) and status >= 400:
        print(f"[unlocker] upstream status={status} for {url}", flush=True)
        return None
    if not isinstance(content, str) or not content.strip():
        return None
    return content


def fetch_html(url: str, timeout: float = 90.0) -> str | None:
    """Fetch a URL through Scrapfly ASP and return the rendered HTML.
    None on any failure so callers can gracefully give up."""
    env = _call(url, timeout=timeout)
    if not env:
        return None
    return _extract_content(env, url)


def fetch_json(url: str, timeout: float = 90.0) -> Any:
    """Same as fetch_html but parses the body as JSON. Used to re-fetch
    JSON API endpoints (Woo Store API, Shopify /products.json) that a
    site's WAF blocks from our datacenter IPs."""
    env = _call(url, timeout=timeout)
    if not env:
        return None
    content = _extract_content(env, url)
    if not content:
        return None
    try:
        return json.loads(content)
    except (ValueError, TypeError) as e:
        print(
            f"[unlocker.json] parse error: {e}; head={content[:120]!r}",
            flush=True,
        )
        return None
