"""Application settings for FaceVault backend."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings loaded from environment variables and .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:///./facevault.db"
    redis_url: str = "redis://localhost:6379/0"
    polygon_rpc_url: str = ""
    contract_address: str = ""
    pinata_api_key: str = ""
    pinata_secret_key: str = ""
    sendgrid_api_key: str = ""
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    similarity_threshold: float = 0.4
    secret_key: str = "change-me"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached settings instance."""

    return Settings()