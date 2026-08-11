# ---------------------------------------------------------------------------
# Backend FastAPI en ECS Fargate (costo mínimo: 0.25 vCPU / 512 MB, sin NAT)
# ---------------------------------------------------------------------------

# VPC predeterminada + subredes públicas (sin NAT Gateway).
data "aws_vpc" "default" {
  filter {
    name   = "is-default"
    values = ["true"]
  }
}

data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# 1. ECR (imagen del backend)
resource "aws_ecr_repository" "backend" {
  name                 = "vetcore-backend"
  image_tag_mutability = "MUTABLE"
  force_delete         = true
  image_scanning_configuration {
    scan_on_push = true
  }
}

# 2. Security groups
resource "aws_security_group" "alb" {
  name        = "vetcore-alb"
  description = "ALB: HTTP/HTTPS desde internet"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "fargate" {
  name        = "vetcore-fargate"
  description = "Fargate: solo trafico del ALB en el puerto de la app"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 3. ALB orientado a internet
resource "aws_lb" "backend" {
  name               = "vetcore-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.public.ids
}

resource "aws_lb_target_group" "backend" {
  name        = "vetcore-backend-tg"
  port        = var.app_port
  protocol    = "HTTP"
  vpc_id      = data.aws_vpc.default.id
  target_type = "ip"

  health_check {
    path                = "/api/v1/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.backend.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# 4. Roles IAM para ECS
data "aws_iam_policy_document" "ecs_task_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pull de ECR + logs
resource "aws_iam_role" "ecs_exec" {
  name               = "vetcore-ecs-exec"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy_attachment" "ecs_exec" {
  role       = aws_iam_role.ecs_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task role: productor SQS (SendMessage) + logs
data "aws_iam_policy_document" "ecs_task" {
  statement {
    actions   = ["sqs:SendMessage"]
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

resource "aws_iam_role" "ecs_task" {
  name               = "vetcore-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_task_assume.json
}

resource "aws_iam_role_policy" "ecs_task" {
  name   = "sqs-and-logs"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task.json
}

# 5. ECS Cluster + Fargate
resource "aws_ecs_cluster" "main" {
  name = "vetcore"
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/vetcore-backend"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "vetcore-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256" # 0.25 vCPU
  memory                   = "512" # 0.5 GB
  execution_role_arn       = aws_iam_role.ecs_exec.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "backend"
      image = "${aws_ecr_repository.backend.repository_url}:${var.app_image_tag}"
      portMappings = [
        { containerPort = var.app_port, protocol = "tcp" }
      ]
      environment = [
        { name = "APP_NAME", value = "VetCore API" },
        { name = "ENV", value = "production" },
        { name = "DEBUG", value = "false" },
        { name = "DATABASE_URL", value = var.database_url },
        { name = "JWT_SECRET", value = var.jwt_secret },
        { name = "JWT_ALGORITHM", value = "HS256" },
        { name = "JWT_ACCESS_TOKEN_EXPIRE_MINUTES", value = "480" },
        { name = "SQS_QUEUE_URL", value = var.sqs_queue_url },
        { name = "SQS_REGION", value = var.sqs_region },
        { name = "AWS_REGION", value = var.region },
        { name = "SMTP_HOST", value = var.smtp_host },
        { name = "SMTP_PORT", value = tostring(var.smtp_port) },
        { name = "SMTP_USER", value = var.smtp_user },
        { name = "SMTP_PASSWORD", value = var.smtp_password },
        { name = "SMTP_FROM", value = var.smtp_from },
        { name = "SMTP_STARTTLS", value = tostring(var.smtp_starttls) },
        { name = "R2_ENDPOINT", value = var.r2_endpoint },
        { name = "R2_ACCESS_KEY_ID", value = var.r2_access_key_id },
        { name = "R2_SECRET_ACCESS_KEY", value = var.r2_secret_access_key },
        { name = "R2_BUCKET_NAME", value = var.r2_bucket_name },
        { name = "R2_PUBLIC_BASE_URL", value = var.r2_public_base_url },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.region
          "awslogs-stream-prefix" = "backend"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "backend" {
  name            = "vetcore-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.public.ids
    security_groups  = [aws_security_group.fargate.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = var.app_port
  }

  depends_on = [aws_lb_listener.http]
}

# --- Salidas ---
output "alb_dns_name" {
  description = "DNS del ALB para probar la API"
  value       = aws_lb.backend.dns_name
}

output "ecr_repository_url" {
  description = "URL del repositorio ECR del backend"
  value       = aws_ecr_repository.backend.repository_url
}

# ===========================================================================
# HTTPS DE PRODUCCIÓN (FUTURO)
# ---------------------------------------------------------------------------
# TODO: Descomentar este bloque cuando se compre el dominio oficial.
#  1) Crea un certificado ACM en us-east-1 con validación DNS.
#  2) El output "acm_cert_validation" te dará el CNAME a crear en tu DNS
#     (puede ser Route53, Cloudflare, etc.).
#  3) Una vez validado, comenta el Listener HTTP (forward) de arriba y
#     descomenta el Listener HTTP->HTTPS redirect + el Listener HTTPS (443).
#  4) En `variables.tf` agrega: variable "domain_name" y (si usas Route53)
#     variable "route53_zone_id".
# ===========================================================================
# TODO: Descomentar esto cuando se compre el dominio — pega tu dominio real aquí:
# variable "domain_name" {
#   type    = string
#   default = "vetcore.example.com"  # <<< TU DOMINIO REAL
# }
# variable "route53_zone_id" {
#   type    = string
#   default = ""  # <<< Zone ID de Route53 si usas AWS DNS (opcional)
# }
#
# # a) Certificado SSL en ACM (us-east-1) con validación DNS
# resource "aws_acm_certificate" "backend" {
#   domain_name       = var.domain_name
#   validation_method = "DNS"
#   lifecycle {
#     create_before_destroy = true
#   }
# }
#
# # b) Output con los registros CNAME de validación
# output "acm_cert_validation" {
#   description = "Registros CNAME de validación DNS del certificado ACM"
#   value = {
#     for dvo in aws_acm_certificate.backend.domain_validation_options :
#     dvo.domain_name => {
#       name   = dvo.resource_record_name
#       type   = dvo.resource_record_type
#       record = dvo.resource_record_value
#     }
#   }
# }
#
# # (Opcional) Crea los registros CNAME automáticamente en Route53 si usas AWS DNS.
# # Si tu dominio está en otro proveedor, crea el CNAME manualmente con el output de arriba.
# resource "aws_route53_record" "backend_cert" {
#   for_each = {
#     for dvo in aws_acm_certificate.backend.domain_validation_options :
#     dvo.domain_name => {
#       name   = dvo.resource_record_name
#       record = dvo.resource_record_value
#       type   = dvo.resource_record_type
#     }
#   }
#   allow_overwrite = true
#   name            = each.value.name
#   records         = [each.value.record]
#   ttl             = 60
#   type            = each.value.type
#   zone_id         = var.route53_zone_id
# }
#
# resource "aws_acm_certificate_validation" "backend" {
#   certificate_arn         = aws_acm_certificate.backend.arn
#   validation_record_fqdns = [for record in aws_route53_record.backend_cert : record.fqdn]
# }
#
# # c) Cambia el Listener HTTP (80) a REDIRECT -> 443.
# #    COMENTA el `aws_lb_listener.http` (forward) de la sección actual y
# #    descomenta este en su lugar:
# resource "aws_lb_listener" "http" {
#   load_balancer_arn = aws_lb.backend.arn
#   port              = 80
#   protocol          = "HTTP"
#   default_action {
#     type = "redirect"
#     redirect {
#       port        = "443"
#       protocol    = "HTTPS"
#       status_code = "HTTP_301"
#     }
#   }
# }
#
# # d) Listener HTTPS (443) que hace FORWARD al Target Group de Fargate
# resource "aws_lb_listener" "https" {
#   load_balancer_arn = aws_lb.backend.arn
#   port              = 443
#   protocol          = "HTTPS"
#   ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
#   certificate_arn   = aws_acm_certificate.backend.arn
#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.backend.arn
#   }
# }
#
# # Al descomentar: asegúrate de que el aws_ecs_service.backend tenga
# # `depends_on = [aws_lb_listener.http, aws_lb_listener.https]`.
