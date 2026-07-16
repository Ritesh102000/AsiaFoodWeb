from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AFC Grocery RAG API"
    environment: str = "development"
    database_url: str = "postgresql+asyncpg://afc:afc@localhost:5432/afc"
    openai_api_key: str | None = None
    openai_chat_model: str = "gpt-5.6-terra"
    openai_embedding_model: str = "text-embedding-3-small"
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "afc_general_kb"
    admin_username: str = "admin"
    admin_password: str = "change-me-for-production"
    session_secret: str = "development-only-session-secret"
    frontend_origins: str = "http://localhost:3000,http://localhost:5173"
    secure_cookies: bool = False
    session_cookie_samesite: str = "lax"
    data_dir: Path = Path(__file__).resolve().parents[1] / "data" / "afc"

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"), env_file_encoding="utf-8", extra="ignore"
    )

    @property
    def cors_origins(self) -> list[str]:
        return [item.strip() for item in self.frontend_origins.split(",") if item.strip()]

    @property
    def async_database_url(self) -> str:
        """Normalize provider URLs for SQLAlchemy's asyncpg dialect."""
        raw = self.database_url
        if raw.startswith("postgres://"):
            raw = "postgresql://" + raw.removeprefix("postgres://")
        if raw.startswith("postgresql://"):
            raw = "postgresql+asyncpg://" + raw.removeprefix("postgresql://")
        parts = urlsplit(raw)
        query = []
        for key, value in parse_qsl(parts.query, keep_blank_values=True):
            if key == "channel_binding":
                continue
            query.append(("ssl" if key == "sslmode" else key, value))
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


@lru_cache
def get_settings() -> Settings:
    return Settings()
