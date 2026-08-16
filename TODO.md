# TODO — Pendientes del proyecto VetCore

Lista de trabajo diferido. Cada ítem se mueve a una subfase cuando se decide implementarlo.

## ⬆️ Volver a levantar la infraestructura (producción)

> La infra de AWS se apagó por completo (`terraform destroy`, 2026-08-12) para no generar costos.
> El estado queda en `infra/terraform.tfstate` (local). Recrear NO pierde la BD (Supabase) ni R2.
> Desarrollo local mientras tanto: backend `uvicorn` en `:8001`, frontend `vite` en `:5173`.

- [ ] **1. Aplicar Terraform** — desde `infra/`:
  - `terraform apply -auto-approve` (recrea ECS, ALB, target group, security groups, ECR, SQS, Lambda, IAM).
  - Anotar el **nuevo DNS del ALB** del output (`alb_dns_name`) — **cambia** en cada recreación.
- [ ] **2. Subir la imagen del backend a ECR** (el repo ECR se borró con el destroy):
  - `aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 404167069240.dkr.ecr.us-east-1.amazonaws.com`
  - `docker build -t vetcore-backend:latest backend`
  - `docker tag vetcore-backend:latest 404167069240.dkr.ecr.us-east-1.amazonaws.com/vetcore-backend:latest`
  - `docker push 404167069240.dkr.ecr.us-east-1.amazonaws.com/vetcore-backend:latest`
- [ ] **3. Desplegar el backend**:
  - `aws ecs update-service --cluster vetcore --service vetcore-backend --force-new-deployment`
  - `aws ecs wait services-stable --cluster vetcore --services vetcore-backend`
  - `curl http://<NUEVO-DNS-ALB>/api/v1/health` → debe dar `200`.
- [ ] **4. Actualizar el proxy de Netlify** (`frontend/public/_redirects`): reemplazar la URL del ALB viejo por el **nuevo** `alb_dns_name` en las líneas `/api/*` y `/media/*`, y pushear (el workflow despliega a Netlify).
- [ ] **5. Migraciones de BD** (si agregamos migraciones en local): `cd backend && .venv/bin/python -m alembic upgrade head`.
- [ ] **6. Dominio + HTTPS (producción real)** — Escenario B documentado en `~/Documentos/proyectos/production_instructions.txt`:
  - Comprar dominio, hosted zone en Route53 (o DNS externo).
  - Descomentar el bloque HTTPS comentado en `infra/ecs.tf` (ACM + listener 443 + redirect 80→443) y definir `domain_name`/`route53_zone_id` en `terraform.tfvars`.
  - Apuntar `api.tudominio.com` → ALB y `app.tudominio.com` → Netlify.
  - Actualizar `_redirects` para usar `https://api.tudominio.com` en `/api/*` y `/media/*`.
- [ ] **7. Encender el sitio**: confirmar Netlify + `https://app.tudominio.com` respondiendo con login.

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
