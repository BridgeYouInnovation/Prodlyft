"""Generate Shopify and WooCommerce Product CSV files from our Product dicts.

Column sets are a minimum-viable subset that each importer accepts:
- Shopify: matches the Shopify Product CSV template
- WooCommerce: matches the built-in Product CSV importer
"""
from __future__ import annotations

import csv
import io
from typing import Iterable


SHOPIFY_COLUMNS = [
    "Handle",
    "Title",
    "Body (HTML)",
    "Vendor",
    "Product Category",
    "Type",
    "Tags",
    "Published",
    "Option1 Name",
    "Option1 Value",
    "Variant SKU",
    "Variant Price",
    "Variant Compare At Price",
    "Variant Inventory Qty",
    "Variant Inventory Policy",
    "Variant Fulfillment Service",
    "Variant Requires Shipping",
    "Variant Taxable",
    "Image Src",
    "Image Position",
    "Image Alt Text",
    "SEO Title",
    "SEO Description",
    "Status",
]


WOO_COLUMNS = [
    "ID",
    "Type",
    "SKU",
    "Name",
    "Published",
    "Is featured?",
    "Visibility in catalog",
    "Short description",
    "Description",
    "In stock?",
    "Regular price",
    "Sale price",
    "Categories",
    "Tags",
    "Images",
]


def _slugify(s: str) -> str:
    import re
    s = (s or "").lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def shopify_csv(products: Iterable[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=SHOPIFY_COLUMNS, extrasaction="ignore")
    w.writeheader()
    for p in products:
        handle = p.get("handle") or _slugify(p.get("title") or "product")
        images = p.get("images") or []
        variants = p.get("variants") or [{
            "title": "Default Title",
            "sku": p.get("sku"),
            "price": p.get("price"),
            "compare_at_price": p.get("compare_at_price"),
            "option1": "Default Title",
        }]
        tags = ", ".join(p.get("tags") or [])
        category = (p.get("categories") or [""])[0]
        description_html = (p.get("description") or "").replace("\n", "<br/>")

        first_variant = variants[0]
        # First row: product + first variant + first image
        row = {
            "Handle": handle,
            "Title": p.get("title") or "",
            "Body (HTML)": description_html,
            "Vendor": p.get("brand") or "",
            "Product Category": category,
            "Type": category,
            "Tags": tags,
            "Published": "TRUE",
            "Option1 Name": "Title",
            "Option1 Value": first_variant.get("option1") or first_variant.get("title") or "Default Title",
            "Variant SKU": first_variant.get("sku") or "",
            "Variant Price": first_variant.get("price") if first_variant.get("price") is not None else "",
            "Variant Compare At Price": first_variant.get("compare_at_price") if first_variant.get("compare_at_price") else "",
            "Variant Inventory Qty": first_variant.get("inventory_quantity") if first_variant.get("inventory_quantity") is not None else "",
            "Variant Inventory Policy": "deny",
            "Variant Fulfillment Service": "manual",
            "Variant Requires Shipping": "TRUE",
            "Variant Taxable": "TRUE",
            "Image Src": images[0] if images else "",
            "Image Position": "1" if images else "",
            "Image Alt Text": p.get("title") or "",
            "SEO Title": p.get("title") or "",
            "SEO Description": p.get("short_description") or "",
            "Status": "active",
        }
        w.writerow(row)

        # Additional variants
        for i, v in enumerate(variants[1:], start=2):
            w.writerow({
                "Handle": handle,
                "Option1 Name": "Title",
                "Option1 Value": v.get("option1") or v.get("title") or f"Variant {i}",
                "Variant SKU": v.get("sku") or "",
                "Variant Price": v.get("price") if v.get("price") is not None else "",
                "Variant Compare At Price": v.get("compare_at_price") if v.get("compare_at_price") else "",
                "Variant Inventory Qty": v.get("inventory_quantity") if v.get("inventory_quantity") is not None else "",
                "Variant Inventory Policy": "deny",
                "Variant Fulfillment Service": "manual",
                "Variant Requires Shipping": "TRUE",
                "Variant Taxable": "TRUE",
                "Status": "active",
            })

        # Additional images (one row per image, handle only)
        for i, src in enumerate(images[1:], start=2):
            w.writerow({
                "Handle": handle,
                "Image Src": src,
                "Image Position": str(i),
                "Image Alt Text": p.get("title") or "",
            })

    return buf.getvalue()


def woocommerce_csv(products: Iterable[dict]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=WOO_COLUMNS, extrasaction="ignore")
    w.writeheader()
    for p in products:
        images = ", ".join(p.get("images") or [])
        categories = ", ".join(p.get("categories") or [])
        tags = ", ".join(p.get("tags") or [])
        w.writerow({
            "ID": "",
            "Type": "simple",
            "SKU": p.get("sku") or "",
            "Name": p.get("title") or "",
            "Published": "1",
            "Is featured?": "0",
            "Visibility in catalog": "visible",
            "Short description": p.get("short_description") or "",
            "Description": p.get("description") or "",
            "In stock?": "1" if p.get("in_stock") else "0" if p.get("in_stock") is False else "",
            "Regular price": p.get("compare_at_price") or p.get("price") or "",
            "Sale price": p.get("price") if p.get("compare_at_price") and p.get("price") else "",
            "Categories": categories,
            "Tags": tags,
            "Images": images,
        })
    return buf.getvalue()
