import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    ENV_NAME = "base"
    APP_NAME = os.getenv("APP_NAME", "1000 Doors")
    APP_VERSION = "0.0.1"
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-insecure-key")
    TESTING = False
    DEBUG = False


class DevelopmentConfig(Config):
    ENV_NAME = "development"
    DEBUG = True


class TestingConfig(Config):
    ENV_NAME = "testing"
    TESTING = True
    SECRET_KEY = "test-key"


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
