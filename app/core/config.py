"""Application configuration via environment variables."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database — use SQLite for dev, PostgreSQL for production
    DATABASE_URL: str = "sqlite:///./execution_v1.db"

    # Internal JWT (used only for Python-backend-native auth, NOT Supabase users)
    SECRET_KEY: str = "change-this-in-production"
    JWT_SECRET: str = "change-this-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    PWD_ITERATIONS: int = 310000

    # Supabase JWT secret — allows Python backend to verify Supabase-issued tokens
    # Get from: Supabase Dashboard → Project Settings → API → JWT Secret
    SUPABASE_JWT_SECRET: str = ""

    # AI providers
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    OPENAI_API_KEY: str = ""

    # CORS — comma-separated list of allowed frontend origins
    # Production: set to your actual Vercel URL e.g. "https://buildmind.vercel.app"
    FRONTEND_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    LOG_LEVEL: str = "INFO"

    # Weekly report cron — set to "1" in production to enable
    ENABLE_WEEKLY_REPORT_CRON: str = "0"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
