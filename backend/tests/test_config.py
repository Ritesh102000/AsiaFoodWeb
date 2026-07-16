from app.config import Settings


def test_neon_database_url_is_normalized_for_asyncpg():
    settings = Settings(
        database_url=(
            "postgresql://user:password@host-pooler.neon.tech/database"
            "?sslmode=require&channel_binding=require"
        )
    )
    assert settings.async_database_url.startswith("postgresql+asyncpg://")
    assert "ssl=require" in settings.async_database_url
    assert "sslmode" not in settings.async_database_url
    assert "channel_binding" not in settings.async_database_url
