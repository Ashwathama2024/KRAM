from pydantic_settings import BaseSettings
import os


def _build_cors_origins() -> list[str]:
    origins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:80",
        "http://127.0.0.1:5173",
    ]
    # When running as a bundled EXE, the launcher sets KRAM_PORT to the
    # dynamically-allocated port so the browser origin is included in CORS.
    port = os.environ.get("KRAM_PORT")
    if port:
        origins.append(f"http://localhost:{port}")
        origins.append(f"http://127.0.0.1:{port}")
    return origins


class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./kram.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "kram-secret-key-change-in-production")
    APP_NAME: str = "KRAM"
    VERSION: str = "1.0.0"
    CORS_ORIGINS: list = _build_cors_origins()

    class Config:
        env_file = ".env"


settings = Settings()

