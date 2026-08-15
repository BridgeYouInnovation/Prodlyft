"""Shared exception types that need to be recognised across modules."""
from __future__ import annotations


class SiteBlockedError(Exception):
    """A site's WAF / bot protection actively blocked our request.

    Distinct from generic HTTP/network errors so the worker can surface an
    honest "this site blocks scrapers" message instead of a misleading
    "we couldn't find products" one.
    """

    def __init__(
        self,
        host: str,
        status: int | None = None,
        mitigator: str | None = None,
    ) -> None:
        self.host = host
        self.status = status
        self.mitigator = mitigator  # "cloudflare", "akamai", "datadome", …
        detail = f"blocked by {mitigator}" if mitigator else "blocked by anti-bot"
        if status:
            detail = f"{detail} (HTTP {status})"
        super().__init__(f"{host}: {detail}")
