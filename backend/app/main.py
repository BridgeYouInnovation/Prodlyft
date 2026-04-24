from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import get_settings
from .csv_export import shopify_csv, woocommerce_csv
from .db import SessionLocal, init_db
from .models import Crawl
from .queue import queue
from .schemas import (
    CrawlCreateRequest,
    CrawlCreateResponse,
    CrawlOut,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


settings = get_settings()

app = FastAPI(title="Prodlyft API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/crawl", response_model=CrawlCreateResponse, status_code=202)
def create_crawl(body: CrawlCreateRequest):
    url = str(body.url)
    platform = body.platform
    mode = "single" if platform == "other" else "catalog"

    max_products = body.max_products
    if max_products is not None and max_products <= 0:
        max_products = None
    category_filter = (body.category_filter or "").strip() or None

    with SessionLocal() as s:
        c = Crawl(
            url=url,
            platform=platform,
            mode=mode,
            status="pending",
            progress={"step": "queued"},
            max_products=max_products,
            category_filter=category_filter,
            user_id=body.user_id,
        )
        s.add(c)
        s.commit()
        s.refresh(c)
        crawl_id = c.id
        resolved_platform = c.platform
        resolved_mode = c.mode
    queue.enqueue("app.worker.process_crawl", crawl_id, job_id=f"prodlyft:{crawl_id}")
    return CrawlCreateResponse(crawl_id=crawl_id, platform=resolved_platform, mode=resolved_mode)


@app.get("/crawl/{crawl_id}", response_model=CrawlOut)
def get_crawl(crawl_id: str, include_products: bool = Query(True)):
    with SessionLocal() as s:
        c = s.get(Crawl, crawl_id)
        if not c:
            raise HTTPException(404, "Crawl not found")
        return CrawlOut(**c.to_dict(include_products=include_products))


@app.get("/crawls", response_model=list[CrawlOut])
def list_crawls(limit: int = 20, user_id: int | None = None):
    limit = max(1, min(limit, 100))
    with SessionLocal() as s:
        q = s.query(Crawl)
        if user_id is not None:
            q = q.filter(Crawl.user_id == user_id)
        rows = q.order_by(Crawl.created_at.desc()).limit(limit).all()
        return [CrawlOut(**r.to_dict(include_products=False)) for r in rows]


@app.get("/crawl/{crawl_id}/export")
def export_crawl(crawl_id: str, format: str = Query("shopify")):
    fmt = format.lower()
    if fmt not in ("shopify", "woocommerce", "woo"):
        raise HTTPException(400, "format must be 'shopify' or 'woocommerce'")
    with SessionLocal() as s:
        c = s.get(Crawl, crawl_id)
        if not c:
            raise HTTPException(404, "Crawl not found")
        if c.status != "done":
            raise HTTPException(409, f"Crawl status is '{c.status}', not 'done'")
        products = [p.to_dict() for p in c.products]

    if fmt == "shopify":
        body = shopify_csv(products)
        filename = f"prodlyft-{crawl_id[:8]}-shopify.csv"
    else:
        body = woocommerce_csv(products)
        filename = f"prodlyft-{crawl_id[:8]}-woocommerce.csv"

    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Back-compat shims so older paths don't break during transition.
@app.post("/import", response_model=CrawlCreateResponse, status_code=202, deprecated=True)
def legacy_import(body: CrawlCreateRequest):
    return create_crawl(body)


@app.get("/job/{crawl_id}", response_model=CrawlOut, deprecated=True)
def legacy_job(crawl_id: str):
    return get_crawl(crawl_id, include_products=True)


@app.get("/jobs", response_model=list[CrawlOut], deprecated=True)
def legacy_jobs(limit: int = 20):
    return list_crawls(limit=limit)
