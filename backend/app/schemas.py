from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, HttpUrl, ConfigDict


Platform = Literal["shopify", "woocommerce", "other", "auto"]
CrawlStatus = Literal["pending", "processing", "done", "failed"]
CrawlMode = Literal["catalog", "single"]


class CrawlCreateRequest(BaseModel):
    url: HttpUrl
    platform: Platform = "auto"
    max_products: int | None = None
    category_filter: str | None = None
    # Populated by the Next.js proxy from the signed-in session. Anonymous
    # submits are blocked at the proxy layer, so this should always be set
    # in practice — but we keep it nullable for back-compat.
    user_id: int | None = None


class CrawlCreateResponse(BaseModel):
    crawl_id: str
    platform: str
    mode: str


class ProductOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    title: str | None = None
    handle: str | None = None
    sku: str | None = None
    brand: str | None = None
    price: float | None = None
    compare_at_price: float | None = None
    currency: str = "USD"
    short_description: str | None = None
    description: str | None = None
    categories: list[str] = []
    tags: list[str] = []
    images: list[str] = []
    variants: list[dict[str, Any]] = []
    in_stock: bool | None = None
    source_url: str | None = None


class CrawlOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    url: str
    platform: str
    mode: str
    status: CrawlStatus
    error: str | None = None
    progress: dict[str, Any] | None = None
    total: int = 0
    product_count: int | None = None
    thumbnails: list[str] = []
    products: list[ProductOut] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
