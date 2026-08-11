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
