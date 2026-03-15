from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./dutysync.db")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dutysync-secret-key-change-in-production")
    APP_NAME: str = "KRAM"
    VERSION: str = "1.0.0"
    CORS_ORIGINS: list = ["http://localhost:5173", "http://localhost:3000", "http://localhost:80"]

    class Config:
        env_file = ".env"


settings = Settings()

