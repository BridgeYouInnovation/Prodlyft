"""AI cleanup via OpenRouter. Takes a raw scraped payload and returns a
normalized product record with clean title, description, categories, and tags."""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from .config import get_settings


SYSTEM_PROMPT = (
    "You are a product-data cleanup assistant for a commerce platform. "
    "Given raw scraped product data, return a concise, merchant-ready JSON "
    "object with this exact shape:\n"
    "{\n"
    '  "title": string,\n'
    '  "short_description": string (1-2 sentences, plain text),\n'
    '  "description": string (clean marketing copy, 2-4 short paragraphs, no HTML),\n'
    '  "price": number | null,\n'
    '  "currency": string (ISO, default USD),\n'
    '  "categories": string[] (1-3, broad),\n'
    '  "tags": string[] (3-8, specific),\n'
    '  "sku": string | null,\n'
    '  "brand": string | null,\n'
    '  "images": string[] (keep originals unchanged),\n'
    '  "in_stock": boolean | null\n'
    "}\n"
    "Rules:\n"
    "- Never invent facts not supported by the raw data.\n"
    "- Trim boilerplate, shipping notices, cookie banners.\n"
    "- Keep `images` and `source_url` unchanged.\n"
    "- Respond with ONLY the JSON object. No prose, no markdown fence."
)


def _extract_json(text: str) -> dict[str, Any] | None:
    if not text:
        return None
    text = text.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return None
    return None


def clean_product(raw: dict[str, Any]) -> dict[str, Any]:
    """Return a cleaned product dict. Falls back to raw if API key missing or call fails."""
    settings = get_settings()
    if not settings.openrouter_api_key:
        return _fallback(raw)

    payload = {
        "model": settings.openrouter_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Raw scraped product data:\n" + json.dumps(raw, ensure_ascii=False),
            },
        ],
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
    }
    try:
        with httpx.Client(timeout=45.0) as client:
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
            data = r.json()
            content = data["choices"][0]["message"]["content"]
    except Exception as e:
        cleaned = _fallback(raw)
        cleaned["_ai_error"] = str(e)
        return cleaned

    parsed = _extract_json(content)
    if not parsed:
        cleaned = _fallback(raw)
        cleaned["_ai_error"] = "could_not_parse"
        return cleaned

    parsed.setdefault("images", raw.get("images") or [])
    parsed["source_url"] = raw.get("source_url")
    return parsed


def _fallback(raw: dict[str, Any]) -> dict[str, Any]:
    desc = (raw.get("description") or "").strip()
    short = desc[:180].rstrip()
    if len(desc) > 180:
        short = short.rsplit(" ", 1)[0] + "…"
    return {
        "title": raw.get("title"),
        "short_description": short,
        "description": desc,
        "price": raw.get("price"),
        "currency": raw.get("currency") or "USD",
        "categories": raw.get("categories") or [],
        "tags": [],
        "sku": raw.get("sku"),
        "brand": raw.get("brand"),
        "images": raw.get("images") or [],
        "in_stock": raw.get("in_stock"),
        "source_url": raw.get("source_url"),
    }
