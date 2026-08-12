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

    # Media (MVP: storage local; R2 cuando existan credenciales)
    media_root: str = "media"

    # WhatsApp Business (Meta Cloud API)
    whatsapp_api_version: str = "v21.0"
    whatsapp_graph_base: str = "https://graph.facebook.com"
    whatsapp_webhook_verify_token: str = "vetcore-verify-2026"

    # Cola de mensajes salientes (Amazon SQS)
    sqs_queue_url: str = ""
    sqs_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # SMTP (envío de correos)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_starttls: bool = True

    # Alertas inteligentes: barrido periódico (segundos; 0 = desactivado)
    smart_alerts_sweep_seconds: int = 900

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
