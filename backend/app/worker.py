"""RQ task: process a job — scrape, AI-clean, persist."""
from __future__ import annotations

from datetime import datetime

from .db import SessionLocal
from .models import Job
from .scraper import scrape_url
from .ai import clean_product


def _update(job_id: str, **fields):
    with SessionLocal() as s:
        job = s.get(Job, job_id)
        if not job:
            return
        for k, v in fields.items():
            setattr(job, k, v)
        job.updated_at = datetime.utcnow()
        s.commit()


def process_import(job_id: str) -> None:
    _update(job_id, status="processing", progress={"step": "fetching"})
    with SessionLocal() as s:
        job = s.get(Job, job_id)
        if not job:
            return
        url = job.url

    def on_progress(step: str, meta: dict):
        _update(job_id, progress={"step": step, **(meta or {})})

    try:
        raw = scrape_url(url, on_progress=on_progress)
        _update(job_id, progress={"step": "cleaning"})
        cleaned = clean_product(raw)
        _update(job_id, status="done", result=cleaned, progress={"step": "done"}, error=None)
    except Exception as e:
        _update(job_id, status="failed", error=str(e), progress={"step": "failed"})
        raise
