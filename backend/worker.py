"""RQ worker entry. Run: `python worker.py` (or via Dockerfile CMD)."""
from redis import Redis
from rq import Worker, Queue

from app.config import get_settings
from app.db import init_db


def main() -> None:
    settings = get_settings()
    init_db()
    conn = Redis.from_url(settings.redis_url)
    worker = Worker([Queue("prodlyft", connection=conn)], connection=conn)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
