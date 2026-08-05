from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "VetCore API"
    env: str = "development"
    debug: bool = True
    backend_port: int = 8001

    postgres_user: str = "vetcore"
    postgres_password: str = "vetcore_dev"
    postgres_db: str = "vetcore"
    postgres_host: str = "localhost"
    postgres_port: int = 5433
    database_url: str = ""

    jwt_secret: str = "dev-only-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 480

    super_admin_email: str = "admin@vetcore.app"
    super_admin_password: str = "change-me-in-production"
    super_admin_name: str = "Super Admin"

    r2_endpoint: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    r2_public_base_url: str = ""

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
