from datetime import datetime
from sqlalchemy import String, Text, DateTime, JSON, Float, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
import uuid

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Crawl(Base):
    __tablename__ = "crawls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(20), default="other", index=True)
    # shopify | woocommerce | other
    mode: Mapped[str] = mapped_column(String(10), default="catalog")
    # catalog | single
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    # pending | processing | done | failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    total: Mapped[int] = mapped_column(Integer, default=0)

    # Scrape options set by the user at submit time.
    max_products: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category_filter: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    products: Mapped[list["Product"]] = relationship(
        "Product", back_populates="crawl", cascade="all, delete-orphan", lazy="selectin"
    )

    def to_dict(self, include_products: bool = False) -> dict:
        d = {
            "id": self.id,
            "url": self.url,
            "platform": self.platform,
            "mode": self.mode,
            "status": self.status,
            "error": self.error,
            "progress": self.progress,
            "total": self.total,
            "max_products": self.max_products,
            "category_filter": self.category_filter,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_products:
            d["products"] = [p.to_dict() for p in self.products]
        else:
            d["product_count"] = len(self.products or [])
            # Thumbnail preview: up to 4 first images
            d["thumbnails"] = []
            for p in (self.products or [])[:4]:
                imgs = p.images or []
                if imgs:
                    d["thumbnails"].append(imgs[0])
        return d


class Product(Base):
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    crawl_id: Mapped[str] = mapped_column(String(36), ForeignKey("crawls.id", ondelete="CASCADE"), index=True)

    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    handle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sku: Mapped[str | None] = mapped_column(String(128), nullable=True)
    brand: Mapped[str | None] = mapped_column(String(255), nullable=True)

    price: Mapped[float | None] = mapped_column(Float, nullable=True)
    compare_at_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="USD")

    short_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    categories: Mapped[list | None] = mapped_column(JSON, nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, nullable=True)
    images: Mapped[list | None] = mapped_column(JSON, nullable=True)
    variants: Mapped[list | None] = mapped_column(JSON, nullable=True)

    in_stock: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source_url: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    crawl: Mapped["Crawl"] = relationship("Crawl", back_populates="products")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "crawl_id": self.crawl_id,
            "title": self.title,
            "handle": self.handle,
            "sku": self.sku,
            "brand": self.brand,
            "price": self.price,
            "compare_at_price": self.compare_at_price,
            "currency": self.currency,
            "short_description": self.short_description,
            "description": self.description,
            "categories": self.categories or [],
            "tags": self.tags or [],
            "images": self.images or [],
            "variants": self.variants or [],
            "in_stock": self.in_stock,
            "source_url": self.source_url,
        }
