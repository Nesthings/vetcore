variable "region" {
  description = "Región de AWS"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefijo para los nombres de los recursos"
  type        = string
  default     = "vetcore"
}

variable "lambda_zip_path" {
  description = "Ruta al zip empaquetado de la Lambda (generado con build_lambda.sh)"
  type        = string
  default     = "./lambda.zip"
}

variable "database_url" {
  description = "Cadena de conexión a Postgres (postgresql+psycopg://...)"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret (deriva la clave Fernet para descifrar el token de WhatsApp Business)"
  type        = string
  sensitive   = true
}

# VPC opcional: si la BD está dentro de una VPC, indica subnets y security group.
variable "lambda_vpc_subnet_ids" {
  description = "Subnets privadas para la Lambda (vacío si la BD es pública)"
  type        = list(string)
  default     = []
}

variable "lambda_vpc_security_group_ids" {
  description = "Security groups para la Lambda dentro de la VPC"
  type        = list(string)
  default     = []
}

# --- Backend ECS (Fargate) ---
variable "app_image_tag" {
  description = "Tag de la imagen del backend en ECR"
  type        = string
  default     = "latest"
}

variable "app_port" {
  description = "Puerto HTTP del contenedor (uvicorn)"
  type        = number
  default     = 8000
}

variable "sqs_queue_url" {
  description = "URL de la cola SQS principal (productor del backend)"
  type        = string
  default     = ""
}

variable "sqs_region" {
  description = "Región de la cola SQS"
  type        = string
  default     = "us-east-1"
}

# SMTP (envío de correos del backend)
variable "smtp_host" {
  type    = string
  default = ""
}
variable "smtp_port" {
  type    = number
  default = 587
}
variable "smtp_user" {
  type    = string
  default = ""
}
variable "smtp_password" {
  type      = string
  default   = ""
  sensitive = true
}
variable "smtp_from" {
  type    = string
  default = ""
}
variable "smtp_starttls" {
  type    = bool
  default = true
}

# --- Cloudflare R2 (almacenamiento de media) ---
variable "r2_endpoint" {
  description = "Endpoint S3-compatible de R2 (https://<ACCOUNT_ID>.r2.cloudflarestorage.com)"
  type        = string
  default     = ""
}
variable "r2_access_key_id" {
  description = "Access Key ID del token de API de R2"
  type        = string
  default     = ""
  sensitive   = true
}
variable "r2_secret_access_key" {
  description = "Secret Access Key del token de API de R2"
  type        = string
  default     = ""
  sensitive   = true
}
variable "r2_bucket_name" {
  description = "Nombre del bucket R2"
  type        = string
  default     = ""
}
variable "r2_public_base_url" {
  description = "URL pública del bucket R2 (p. ej. https://pub-XXXX.r2.dev/vetcore-media)"
  type        = string
  default     = ""
}
