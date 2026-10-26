from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://policy:policy@localhost:5432/policy"
    cors_origins: list[str] = ["http://localhost:5173"]
    worker_poll_seconds: float = 2.0
    # Simulation processes. Each needs about 2 GB plus its share of about 8 GB of working memory,
    # so 2 shards need about 12 GB and 8 shards about 24 GB. More shards finish sooner.
    engine_shards: int = 2


settings = Settings()
