from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://prodlyft:prodlyft@localhost:5432/prodlyft"
    redis_url: str = "redis://localhost:6379/0"

    openrouter_api_key: str = ""
    openrouter_model: str = "google/gemini-2.5-flash"
    # Smarter (more expensive) model used only for HTML → config inference
    # when a site isn't recognised by rule-based detection. Cached per
    # domain so cost stays linear in unique domains, not requests.
    openrouter_scraper_model: str = "anthropic/claude-sonnet-4.5"

    cors_origins: str = "http://localhost:3000"

    scraper_timeout_ms: int = 30000
    scraper_user_agent: str = (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    admin_seed_email: str = ""
    admin_seed_password: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
