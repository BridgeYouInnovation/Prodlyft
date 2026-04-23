from datetime import datetime
from typing import Any, Literal
from pydantic import BaseModel, HttpUrl


class ImportRequest(BaseModel):
    url: HttpUrl


class ImportResponse(BaseModel):
    job_id: str


JobStatus = Literal["pending", "processing", "done", "failed"]


class JobResponse(BaseModel):
    id: str
    url: str
    status: JobStatus
    error: str | None = None
    result: dict[str, Any] | None = None
    progress: dict[str, Any] | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
