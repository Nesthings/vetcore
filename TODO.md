# TODO — Pendientes del proyecto VetCore

Lista de trabajo diferido. Cada ítem se mueve a una subfase cuando se decide implementarlo.

## ⬆️ Volver a levantar la infraestructura (producción)

> La infra de AWS se apagó por completo (`terraform destroy`, 2026-09-09) para no generar costos.
> El estado queda en `infra/terraform.tfstate` (local, 0 recursos). Recrear NO pierde la BD (Supabase) ni R2.
> Desarrollo local mientras tanto: backend `uvicorn` en `:8001`, frontend `vite` en `:5173`.

### ⚠️ Antes de empezar — credenciales AWS
La key admin anterior (con prefijo `AKIA...`) **ya no es válida**. La única funcional es `vetcore-adm`
(`~/.aws/credentials`, perfil `default`) y **NO tiene permiso de Lambda** (`lambda:GetFunction`) — el
destroy solo funcionó con `-refresh=false`. Para un apply nuevo se necesita un usuario con permisos completos:
- Otorgar `AdministratorAccess` a `vetcore-adm`, **o**
- Regenerar/crear una key con permisos completos y actualizar `~/.aws/credentials`.

- [ ] **1. Regenerar el zip de la Lambda** (para el `source_code_hash`): desde `infra/`, `bash build_lambda.sh`.
- [ ] **2. Aplicar Terraform** — desde `infra/` (recrea ECR, SQS, Lambda, ALB, target group, security groups, ECS, IAM):
  - `terraform apply -var 'database_url=postgresql+psycopg://postgres.<SUPABASE_REF>:<SUPABASE_DB_PASSWORD>@aws-1-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require' -var 'jwt_secret=<JWT_SECRET>' -var 'super_admin_password=<SUPER_ADMIN_PASSWORD>' -var 'cors_origins=http://localhost:5179,http://localhost:5173'`
  - Los valores reales viven SOLO en local: `infra/terraform.tfstate` (gitignored) y `~/.aws/credentials`. No están en el repo.
  - Anotar el **nuevo DNS del ALB** del output (`alb_dns_name`) — **cambia** en cada recreación.
  - Nota: `SQS_QUEUE_URL` ya se deriva solo de la cola (`infra/ecs.tf`), no se pasa a mano.
- [ ] **3. Subir la imagen del backend a ECR** (el repo ECR se borró con el destroy):
  - `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 404167069240.dkr.ecr.us-east-1.amazonaws.com`
  - `docker build -t 404167069240.dkr.ecr.us-east-1.amazonaws.com/vetcore-backend:latest backend`
  - `docker push 404167069240.dkr.ecr.us-east-1.amazonaws.com/vetcore-backend:latest`
- [ ] **4. Esperar healthy y probar**:
  - `terraform output alb_dns_name`
  - `curl http://<NUEVO-DNS-ALB>/api/v1/health` → debe dar `200 {"status":"ok","database":"connected"}`.
- [ ] **5. Actualizar el proxy de Netlify** (`frontend/public/_redirects`): reemplazar la URL del ALB viejo por el **nuevo** `alb_dns_name` en `/api/*` y `/media/*`, y pushear (el workflow despliega a Netlify).
- [ ] **6. Migraciones de BD** (si agregamos migraciones en local): `cd backend && .venv/bin/python -m alembic upgrade head`.
- [ ] **7. Dominio + HTTPS (producción real)** — Escenario B documentado en `~/Documentos/proyectos/production_instructions.txt`:
  - Comprar dominio, hosted zone en Route53 (o DNS externo).
  - Descomentar el bloque HTTPS comentado en `infra/ecs.tf` (ACM + listener 443 + redirect 80→443) y definir `domain_name`/`route53_zone_id` en `terraform.tfvars`.
  - Apuntar `api.tudominio.com` → ALB y `app.tudominio.com` → Netlify.
  - Actualizar `_redirects` para usar `https://api.tudominio.com` en `/api/*` y `/media/*`.
- [ ] **8. Encender el sitio**: confirmar Netlify + `https://app.tudominio.com` respondiendo con login.

## Acceso del dueño

- [ ] **Acceso directo por token (sin login).** Que el enlace de invitación lleve directamente a la cartilla de la mascota (ver/editar) sin que el dueño cree cuenta ni inicie sesión. Diseño distinto al actual (el documento maestro sí contempla login del owner con "un solo login"; ver sección 3, principio 2 y subfase 1.2). Decidido: se difiere a esta lista.
  - Implicaciones: token de uso único/limitado en tiempo, permisos de solo lectura o edición acotada, revocación.

## Fase 3 — Diferidos (diferenciadores "wow")

- [ ] **3.1 — Transcripción/resumen de consulta por voz con IA.** Diferida por decisión del usuario (2026-08-06) para continuar con el MVP. El esquema de la tabla `consultation_attachments` ya soporta tipo `audio`.
  - Implicaciones: integración con un servicio de STT (Whisper/local o API), transcripción → resumen estructurado, vinculación a la consulta y a su PDF.

- [ ] **3.3 — Hospitalización (hoja de signos vitales por hora).** Puesta en hold por decisión del usuario (2026-08-06). Tablas `hospitalization_records` y `hospitalization_vitals` ya existen en el esquema (FASE 3).
  - Implicaciones: admisión/egreso por paciente, registro horario de temperatura/signos, hoja de signos vitales.

- [ ] **3.4 — Laboratorio integrado.** Puesta en hold junto con 3.3 (2026-08-06). Tabla `lab_orders` ya existe en el esquema (FASE 3).
  - Implicaciones: órdenes de laboratorio, estado (ordered/in_progress/completed), resultados con URL.

- [ ] **3.5 — Dashboard de inteligencia de negocio.** Top enfermedades, razas, predicción de horas pico.
- [ ] **3.6 — Diario de salud del dueño.** Síntomas reportados antes de la cita.

## Envío de recibos (lógica diferida)

- [ ] **Envío de recibo por WhatsApp y por correo.** En el checkout de "Nueva consulta" ya se guardan los flags `invoices.send_receipt_whatsapp` y `invoices.send_receipt_email` (migraciones 0018/0019); falta la lógica real de envío.
  - Destinos: WhatsApp al teléfono del dueño y correo a `owners.email` (el dueño queda vinculado en `invoices.owner_id`).
  - Implicaciones: credenciales del proveedor (WhatsApp/SMTP), adjuntar el recibo PDF (`/invoices/{id}/receipt`), estado/reintentos del envío y respeto al opt-in del dueño (principio 10).
