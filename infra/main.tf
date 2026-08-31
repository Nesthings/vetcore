terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  # Estado remoto (recomendado en equipo): descomenta y configura.
  # backend "s3" {
  #   bucket = "vetcore-tfstate"
  #   key    = "vetcore/terraform.tfstate"
  #   region = "us-east-1"
  # }
}

# 1. Configuración del Proveedor y Región (Punto 4)
provider "aws" {
  region = var.region
}

# 2. Dead Letter Queue (DLQ) (Punto 2)
resource "aws_sqs_queue" "vetcore_whatsapp_dlq" {
  name                      = "vetcore-whatsapp-dlq"
  message_retention_seconds = 1209600 # 14 días
}

# 3. Cola SQS Estándar con Política de Redrive (Puntos 1 y 2)
resource "aws_sqs_queue" "vetcore_whatsapp_main" {
  name                       = "vetcore-whatsapp"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 1209600
  delay_seconds              = 0

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.vetcore_whatsapp_dlq.arn
    maxReceiveCount     = 3
  })
}

# 4. Usuario IAM para el productor/worker en desarrollo local (Punto 3)
resource "aws_iam_user" "vetcore_sqs_user" {
  name = "vetcore-sqs-worker"
}

# 5. Política IAM con los permisos exactos requeridos (Punto 3)
resource "aws_iam_user_policy" "vetcore_sqs_policy" {
  name = "vetcore-sqs-permissions"
  user = aws_iam_user.vetcore_sqs_user.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Effect = "Allow"
        Resource = [
          aws_sqs_queue.vetcore_whatsapp_main.arn,
          aws_sqs_queue.vetcore_whatsapp_dlq.arn
        ]
      }
    ]
  })
}

# 6. Generación de Credenciales de Acceso (Punto 3)
resource "aws_iam_access_key" "vetcore_sqs_key" {
  user = aws_iam_user.vetcore_sqs_user.name
}

# ---------------------------------------------------------------------------
# Lambda worker (escala a cero): recibe de SQS y envía por Meta
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "lambda_policy" {
  statement {
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
    ]
    resources = [aws_sqs_queue.vetcore_whatsapp_main.arn]
  }
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role" "vetcore_worker_lambda" {
  name               = "vetcore-whatsapp-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy" "vetcore_worker_lambda" {
  name   = "sqs-and-logs"
  role   = aws_iam_role.vetcore_worker_lambda.id
  policy = data.aws_iam_policy_document.lambda_policy.json
}

resource "aws_lambda_function" "vetcore_worker" {
  filename         = var.lambda_zip_path
  function_name    = "vetcore-whatsapp-worker"
  role             = aws_iam_role.vetcore_worker_lambda.arn
  handler          = "app.lambda_worker.handler"
  runtime          = "python3.12"
  timeout          = 60
  memory_size      = 256
  source_code_hash = filebase64sha256(var.lambda_zip_path)

  environment {
    variables = {
      DATABASE_URL = var.database_url
      JWT_SECRET   = var.jwt_secret
    }
  }

  dynamic "vpc_config" {
    for_each = var.lambda_vpc_subnet_ids != [] ? [1] : []
    content {
      subnet_ids         = var.lambda_vpc_subnet_ids
      security_group_ids = var.lambda_vpc_security_group_ids
    }
  }
}

resource "aws_lambda_event_source_mapping" "vetcore_worker" {
  event_source_arn = aws_sqs_queue.vetcore_whatsapp_main.arn
  function_name    = aws_lambda_function.vetcore_worker.arn
  batch_size       = 5
  enabled          = true
}

# --- OUTPUTS ---
# Estos bloques te darán los datos que tu agente necesita después de hacer el deploy

output "sqs_main_url" {
  description = "URL de la cola SQS principal"
  value       = aws_sqs_queue.vetcore_whatsapp_main.url
}

output "sqs_dlq_url" {
  description = "URL de la DLQ"
  value       = aws_sqs_queue.vetcore_whatsapp_dlq.url
}

output "iam_access_key_id" {
  description = "Access Key ID para el agente/entorno local"
  value       = aws_iam_access_key.vetcore_sqs_key.id
}

output "iam_secret_access_key" {
  description = "Secret Access Key para el agente/entorno local"
  value       = aws_iam_access_key.vetcore_sqs_key.secret
  sensitive   = true
}

output "worker_function_name" {
  description = "Nombre de la Lambda worker (escala a cero)"
  value       = aws_lambda_function.vetcore_worker.function_name
}
