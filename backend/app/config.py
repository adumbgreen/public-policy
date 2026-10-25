from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://policy:policy@localhost:5432/policy"
    cors_origins: list[str] = ["http://localhost:5173"]
    worker_poll_seconds: float = 2.0


settings = Settings()
