from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "dev-only-secret-change-in-production"
_DEFAULT_SUPER_ADMIN_PASSWORD = "change-me-in-production"


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

    # Pool de conexiones (parametrizable por entorno)
    db_pool_size: int = 2
    db_max_overflow: int = 4

    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 480

    super_admin_email: str = "admin@vetcore.app"
    super_admin_password: str = _DEFAULT_SUPER_ADMIN_PASSWORD
    super_admin_name: str = "Super Admin"

    # CORS: orígenes explícitos separados por coma (env CORS_ORIGINS)
    cors_origins: str = (
        "http://localhost:5173,http://localhost:5179,"
        "http://127.0.0.1:5173,http://127.0.0.1:5179"
    )

    # Barrido de alertas inteligentes (0 = desactivado; env para un solo worker)
    smart_alerts_sweep_seconds: int = 900
    smart_alerts_sweep_enabled: bool = True

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

    @model_validator(mode="after")
    def _validate_security(self) -> "Settings":
        # Bloquea secretos por defecto fuera de desarrollo para evitar
        # tokens falsificables y cuentas predecibles en producción.
        if self.env != "development":
            if self.jwt_secret in (_DEFAULT_JWT_SECRET, "change-me-in-production"):
                raise ValueError(
                    "JWT_SECRET debe configurarse con un valor fuerte en entornos "
                    "que no sean development."
                )
            if self.super_admin_password in (_DEFAULT_SUPER_ADMIN_PASSWORD, "vetcore_dev123"):
                raise ValueError(
                    "SUPER_ADMIN_PASSWORD debe configurarse con un valor fuerte en "
                    "entornos que no sean development."
                )
        return self

    @property
    def resolved_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
