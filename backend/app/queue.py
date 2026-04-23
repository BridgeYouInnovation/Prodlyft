from redis import Redis
from rq import Queue

from .config import get_settings

settings = get_settings()

redis_conn = Redis.from_url(settings.redis_url)
queue = Queue("prodlyft", connection=redis_conn, default_timeout=300)
