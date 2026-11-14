import os

from dotenv import load_dotenv

load_dotenv()


def _env(name: str) -> str | None:
    return os.getenv(name) or None


class Config:
    ENV_NAME = "base"
    APP_NAME = os.getenv("APP_NAME", "1000 Doors")
    APP_VERSION = "0.0.1"
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-key")
    TESTING = False
    DEBUG = False
    # Exposes window.__doors for automated browser tests.
    EXPOSE_DEBUG_HOOKS = False
    # Uploads are shrunk in the browser; this bounds any request body.
    MAX_CONTENT_LENGTH = 3 * 1024 * 1024

    # Supabase. Without DATABASE_URL the app keeps data in memory (lost on restart).
    SUPABASE_URL = _env("SUPABASE_URL")
    SUPABASE_PUBLISHABLE_KEY = _env("SUPABASE_PUBLISHABLE_KEY")
    SUPABASE_SECRET_KEY = _env("SUPABASE_SECRET_KEY")
    SUPABASE_JWKS_URL = _env("SUPABASE_JWKS_URL")
    DATABASE_URL = _env("DATABASE_URL")


class DevelopmentConfig(Config):
    ENV_NAME = "development"
    DEBUG = True
    EXPOSE_DEBUG_HOOKS = True


class TestingConfig(Config):
    ENV_NAME = "testing"
    TESTING = True
    SECRET_KEY = "test-key"
    EXPOSE_DEBUG_HOOKS = True
    # Tests never touch the real project: memory storage and a locally generated
    # signing key stand in for Supabase.
    SUPABASE_URL = "https://supabase.test"
    SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
    SUPABASE_SECRET_KEY = None
    SUPABASE_JWKS_URL = None
    DATABASE_URL = None


class ProductionConfig(Config):
    ENV_NAME = "production"
    SECRET_KEY = os.getenv("SECRET_KEY")


CONFIGS = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str | None = None) -> type[Config]:
    name = name or os.getenv("FLASK_ENV", "development")
    if name not in CONFIGS:
        raise ValueError(f"Unknown config '{name}'. Expected one of {sorted(CONFIGS)}.")
    return CONFIGS[name]
