from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import SessionLocal, init_db
from .models import Job
from .queue import queue
from .schemas import ImportRequest, ImportResponse, JobResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


settings = get_settings()

app = FastAPI(title="Prodlyft API", version="0.1.0", lifespan=lifespan)
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


@app.post("/import", response_model=ImportResponse, status_code=202)
def create_import(body: ImportRequest):
    url = str(body.url)
    with SessionLocal() as s:
        job = Job(url=url, status="pending", progress={"step": "queued"})
        s.add(job)
        s.commit()
        s.refresh(job)
        job_id = job.id
    queue.enqueue("app.worker.process_import", job_id, job_id=f"prodlyft:{job_id}")
    return ImportResponse(job_id=job_id)


@app.get("/job/{job_id}", response_model=JobResponse)
def get_job(job_id: str):
    with SessionLocal() as s:
        job = s.get(Job, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        return JobResponse(**job.to_dict())


@app.get("/jobs", response_model=list[JobResponse])
def list_jobs(limit: int = 20):
    limit = max(1, min(limit, 100))
    with SessionLocal() as s:
        rows = (
            s.query(Job)
            .order_by(Job.created_at.desc())
            .limit(limit)
            .all()
        )
        return [JobResponse(**r.to_dict()) for r in rows]
