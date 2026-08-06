# Sistema de Gestión Veterinaria (SaaS multi-tenant) — Instrucciones maestras de construcción

Este documento es la fuente única de verdad del proyecto. Fusiona el plan de producto/pantallas y el esquema completo de base de datos. Léelo completo antes de escribir la primera línea de código.

---

## 0. REGLAS DE EJECUCIÓN (obligatorias, no opcionales)

1. El trabajo se divide en **Fases** (0, 1, 2, 3) y cada Fase en **Subfases** (ej. 1.1, 1.2, 1.3...). El detalle de cada una está en la sección 6.
2. **Antes de escribir o modificar cualquier archivo de una subfase**, debes detenerte y explicarle al usuario, en texto plano y claro:
   - Qué subfase estás por iniciar y qué objetivo cumple.
   - Qué archivos vas a crear o modificar.
   - Qué decisiones técnicas vas a tomar (si hay más de una forma razonable de hacerlo).
   - Qué le vas a pedir que verifique o pruebe al terminar.
3. **No escribas código de esa subfase hasta que el usuario responda con una aprobación explícita** ("sí", "adelante", "procede", o equivalente). Si el usuario pide cambios al plan, ajústalo y vuelve a presentarlo — no ejecutes la versión no aprobada.
4. **No combines subfases** ni "adelantes trabajo" de una subfase futura, aunque parezca eficiente, salvo que el usuario lo pida explícitamente.
5. Al terminar una subfase, resume brevemente qué quedó funcional y qué es lo siguiente (la próxima subfase), pero **no la empieces** sin repetir el paso 2.
6. Si en cualquier punto encuentras una ambigüedad no resuelta en este documento, detente y pregunta — no asumas ni "rellenes" con tu propio criterio silenciosamente.

---

## 1. Visión general del producto

Sistema de gestión para clínicas veterinarias, modelo **SaaS multi-tenant por suscripción**. El dueño del producto (el usuario que te da estas instrucciones) activa/desactiva manualmente el acceso de cada clínica cliente. Es **una sola web app responsiva** — misma URL, mismo código — accesible desde el navegador tanto en PC como en celular, **sin PWA instalable ni apps nativas**.

Se compone de 4 sistemas conectados por la misma base de datos:

| Sistema | Usuario | Notas |
|---|---|---|
| **A. Panel Clínico** | Veterinario, recepción, admin de clínica | Núcleo operativo |
| **B. Portal del Dueño** | Cliente / dueño de mascota | Cartilla digital y más |
| **C. Motor de Automatización** | Invisible | Jobs/colas: WhatsApp, recordatorios, alertas de stock |
| **D. Panel Super-Admin** | El dueño del producto (una sola persona) | Control de suscripciones de clínicas |

---

## 2. Stack tecnológico (obligatorio)

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite. Diseño responsivo con CSS breakpoints. **Sin PWA, sin service workers.** |
| Backend | FastAPI (Python) |
| Base de datos | PostgreSQL, multi-tenant vía `clinic_id` |
| Storage de media | S3 o Cloudflare R2 |
| Auth | JWT propio o Auth0/Clerk. Roles: `super-admin`, `admin`, `veterinario`, `recepcion`, `owner` (dueño de mascota) |
| Notificaciones | WhatsApp Business API (Twilio o Meta directo) |
| Control de acceso | Middleware que valida `subscription_status` de la clínica en cada request |

---

## 3. Principios de arquitectura NO NEGOCIABLES

Estas reglas condicionan el diseño de datos y de endpoints. No las reinterpretes ni las simplifiques "para el MVP" — están aquí precisamente porque cambiar el modelo después es costoso.

1. **Multi-tenancy real:** toda tabla operativa de la clínica lleva `clinic_id`. Ninguna query debe poder cruzar datos entre clínicas salvo el Panel Super-Admin.
2. **Identidad del dueño (owner) es GLOBAL, no por clínica.** Un mismo dueño puede tener mascotas en distintas clínicas de la red con **un solo login**. La tabla `owners` NO lleva `clinic_id`. La conexión owner↔mascota↔clínica vive en `owner_pet_links`. Al activar un token de invitación: si ya existe un `owner` con ese teléfono/correo, se reutiliza (solo se agrega el link) — **nunca se duplica la cuenta**.
3. **Multi-sucursal desde el día 1 (MVP), no como feature avanzada.** Cada sucursal tiene su propia agenda e inventario (`branch_id` en `appointments`, `inventory_products`, etc.). El expediente del paciente es compartido entre sucursales de la misma clínica.
4. **Peso del paciente es histórico, no un campo fijo.** Vive en `pet_weight_records` (una fila por consulta). La UI muestra por default solo el último registro; el veterinario puede abrir el histórico completo.
5. **La foto de la Cartilla digital (perfil de la mascota) es un campo distinto de la foto clínica del expediente.** Nunca deben sobrescribirse entre sí.
6. **El PDF de resumen de consulta NO es una receta médica formal.** Es un documento informativo (qué se hizo, qué se aplicó, indicaciones). No le agregues elementos que simulen validez legal de prescripción.
7. **Vinculación del dueño = invitación por token, nunca auto-registro libre.** El token se genera al dar de alta la mascota, atado a un teléfono/correo que la clínica ya capturó en persona.
8. **Suspensión de una clínica por falta de pago no debe bloquear por completo al dueño.** Los datos de esa clínica pasan a modo solo-lectura para el dueño; sus otras mascotas (en clínicas activas) siguen funcionando con normalidad.
9. **Permisos de reportes se dividen por contenido, no solo por rol.** Cualquier pantalla con montos de dinero es exclusiva del Admin de clínica. El módulo Financiero (ingresos/egresos) solo lo ve el admin.
10. **Consentimiento explícito (opt-in) es requerido antes de enviar recordatorios por WhatsApp** al dueño (cumplimiento LFPDPPP, México). No lo omitas ni lo actives por default.

---

## 4. Estándar de UI/UX (aplica a TODAS las pantallas, sin excepción)

Esto no es un detalle estético menor — es un requisito funcional del producto. **La interfaz no debe verse como un CRUD genérico ni como un template de admin panel gratuito.** Se compite contra sistemas veterinarios mexicanos anticuados; la modernidad visual es un diferenciador de venta.

**Reglas concretas:**

- **Nunca uses el look "Bootstrap por defecto"**: sin sombras genéricas, sin colores primarios saturados default, sin iconografía inconsistente. Define un sistema de diseño propio (paleta, tipografía, espaciado) antes de construir la primera pantalla y aplícalo de forma consistente en todas.
- **Tipografía cuidada**: una fuente sans-serif moderna (ej. Inter, Manrope, o similar), jerarquía clara de tamaños, buen interlineado. Nada de fuente default del navegador.
- **Espaciado generoso y consistente** (usa una escala de espaciado, ej. múltiplos de 4px/8px) — evita interfaces apretadas o desalineadas.
- **Los Dashboards (Dashboard del día, Dashboard financiero, Dashboard BI) deben mostrar información relevante de forma visual e interactiva**, no solo tablas de texto:
  - Usa gráficas (barras, líneas, dona) donde el dato lo amerite — ej. ingresos del día, consultas por hora, top diagnósticos.
  - Las tarjetas de indicadores (KPIs) deben tener jerarquía visual clara: el número grande y legible, contexto pequeño alrededor (comparación vs. ayer/mes anterior si aplica).
  - Los elementos deben ser interactuables donde tenga sentido: hover states, tooltips con detalle al pasar el mouse, clic para ver el detalle detrás de un número.
- **Estados vacíos, de carga y de error diseñados**, no placeholders genéricos ("No data") — deben sentirse parte del mismo sistema visual.
- **Micro-interacciones sutiles**: transiciones suaves al abrir modales, feedback visual inmediato al guardar/enviar (no silencio ni saltos bruscos de pantalla).
- **Mobile y desktop reciben el mismo cuidado de diseño**, no una versión "reducida" — replantea el layout por completo cuando el espacio lo requiera (ej. tabla de escritorio → tarjetas apilables en móvil), en vez de solo encoger.
- **Componentes reutilizables desde el inicio**: define un set base (botones, inputs, badges de estado, tarjetas, tablas) antes de construir pantallas individuales, para que todo el sistema se sienta cohesivo.
- Si tienes acceso a una librería de componentes moderna (ej. shadcn/ui, Radix + Tailwind), Anthropic recomienda evaluarla para acelerar consistencia visual sin sacrificar el diseño propio — pero la paleta, tipografía y personalidad visual deben seguir siendo decisiones deliberadas, no defaults de la librería.

---

## 5. Esquema completo de base de datos (PostgreSQL)

Ejecuta este esquema tal cual en la Subfase 0.2. Los comentarios `-- [FASE 2]` / `-- [FASE 3]` indican qué tablas pueden diferirse; el resto es MVP.

```sql
-- ============================================================================
-- ESQUEMA DE BASE DE DATOS — Sistema de Gestión Veterinaria (SaaS multi-tenant)
-- PostgreSQL
--
-- PRINCIPIO DE DISEÑO:
--   - Aislamiento multi-tenant vía `clinic_id` en TODA tabla operativa de la clínica.
--   - La identidad del DUEÑO es GLOBAL (tabla `owners`, sin clinic_id) — un mismo
--     dueño puede tener mascotas en distintas clínicas de la red con un solo login.
--   - La identidad del STAFF (vet/recepción/admin) SÍ es por clínica (`users`),
--     porque un veterinario normalmente trabaja para una sola clínica.
--   - Todas las tablas marcadas [FASE 2] / [FASE 3] pueden omitirse en el MVP.
-- ============================================================================


-- ============================================================================
-- 0. SUPER-ADMIN / CLÍNICAS (tenants)
-- ============================================================================

CREATE TABLE clinics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(200) NOT NULL,
    contact_name        VARCHAR(200),
    contact_phone       VARCHAR(30),
    contact_email       VARCHAR(200),
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'trial'
                         CHECK (subscription_status IN ('trial','active','suspended','cancelled')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clinic_subscription_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    event_type  VARCHAR(30) NOT NULL, -- 'activated','suspended','payment_received','cancelled'
    amount      NUMERIC(10,2),
    notes       TEXT,
    created_by  UUID,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clinic_branches (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    name        VARCHAR(150) NOT NULL,
    address     TEXT,
    phone       VARCHAR(30),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_branches_clinic ON clinic_branches(clinic_id);


-- ============================================================================
-- 1. STAFF DE LA CLÍNICA (por clínica, NO global)
-- ============================================================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    branch_id       UUID REFERENCES clinic_branches(id),
    role            VARCHAR(20) NOT NULL
                    CHECK (role IN ('admin','veterinario','recepcion')),
    full_name       VARCHAR(200) NOT NULL,
    email           VARCHAR(200) NOT NULL,
    phone           VARCHAR(30),
    password_hash   TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (clinic_id, email)
);

CREATE INDEX idx_users_clinic ON users(clinic_id);


-- ============================================================================
-- 2. IDENTIDAD DEL DUEÑO (GLOBAL — sin clinic_id)
-- ============================================================================

CREATE TABLE owners (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone                   VARCHAR(30) UNIQUE,
    email                   VARCHAR(200) UNIQUE,
    password_hash           TEXT,
    profile_photo_url       TEXT,
    profile_photo_prev_url  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 3. PACIENTES (mascotas) — por clínica
-- ============================================================================

CREATE TABLE pets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id           UUID NOT NULL REFERENCES clinics(id),
    name                VARCHAR(150) NOT NULL,
    species             VARCHAR(50) NOT NULL,
    breed               VARCHAR(100),
    sex                 VARCHAR(10),
    birth_date          DATE,
    allergies           TEXT,
    clinical_alert_text TEXT,
    clinical_photo_url  TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pets_clinic ON pets(clinic_id);

CREATE TABLE pet_weight_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id          UUID NOT NULL REFERENCES pets(id),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    weight_kg       NUMERIC(6,2) NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    consultation_id UUID
);

CREATE INDEX idx_weight_pet ON pet_weight_records(pet_id, recorded_at DESC);


-- ============================================================================
-- 4. VINCULACIÓN DUEÑO ↔ MASCOTA E INVITACIONES POR TOKEN
-- ============================================================================

CREATE TABLE owner_pet_links (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id    UUID NOT NULL REFERENCES owners(id),
    pet_id      UUID NOT NULL REFERENCES pets(id),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    is_active   BOOLEAN NOT NULL DEFAULT true,
    linked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ,
    UNIQUE (owner_id, pet_id)
);

CREATE INDEX idx_owner_pet_links_owner ON owner_pet_links(owner_id);
CREATE INDEX idx_owner_pet_links_pet ON owner_pet_links(pet_id);

CREATE TABLE owner_invitations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    pet_id          UUID NOT NULL REFERENCES pets(id),
    contact_phone   VARCHAR(30),
    contact_email   VARCHAR(200),
    token           VARCHAR(100) NOT NULL UNIQUE,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','used','expired','revoked')),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_by      UUID REFERENCES users(id),
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lógica de activación (a nivel aplicación, no de esquema):
--   1. Dueño abre el link -> valida token contra owner_invitations.
--   2. Busca un `owner` existente por phone/email.
--   3. Si existe: crea solo un nuevo owner_pet_links (NO una cuenta nueva).
--   4. Si no existe: crea el owner y luego el owner_pet_links.

CREATE INDEX idx_invitations_token ON owner_invitations(token);


-- ============================================================================
-- 5. CONSULTAS
-- ============================================================================

CREATE TABLE consultation_templates ( -- [FASE 2]
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    name        VARCHAR(150) NOT NULL,
    species     VARCHAR(50),
    fields_json JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consultations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    branch_id       UUID REFERENCES clinic_branches(id),
    pet_id          UUID NOT NULL REFERENCES pets(id),
    vet_user_id     UUID NOT NULL REFERENCES users(id),
    template_id     UUID REFERENCES consultation_templates(id),
    reason          TEXT,
    diagnosis       TEXT,
    treatment       TEXT,
    care_instructions TEXT,
    next_appointment_suggestion DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_consultations_pet ON consultations(pet_id, created_at DESC);
CREATE INDEX idx_consultations_clinic ON consultations(clinic_id);

ALTER TABLE pet_weight_records
    ADD CONSTRAINT fk_weight_consultation
    FOREIGN KEY (consultation_id) REFERENCES consultations(id);

CREATE TABLE consultation_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id),
    type            VARCHAR(20) NOT NULL CHECK (type IN ('photo','video','audio')),
    url             TEXT NOT NULL,
    annotation_json JSONB, -- [FASE 2]
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE consultation_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id),
    product_id      UUID,
    description     VARCHAR(200) NOT NULL,
    quantity        NUMERIC(10,2) NOT NULL DEFAULT 1
);

CREATE TABLE consultation_summary_pdfs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) UNIQUE,
    pdf_url         TEXT NOT NULL,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 6. ALERTAS CLÍNICAS [FASE 2]
-- ============================================================================

CREATE TABLE clinical_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id      UUID NOT NULL REFERENCES pets(id),
    type        VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 7. AGENDA
-- ============================================================================

CREATE TABLE appointments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    branch_id       UUID NOT NULL REFERENCES clinic_branches(id),
    pet_id          UUID NOT NULL REFERENCES pets(id),
    vet_user_id     UUID REFERENCES users(id),
    procedure_type  VARCHAR(50) NOT NULL,
    start_time      TIMESTAMPTZ NOT NULL,
    end_time        TIMESTAMPTZ NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','confirmed','completed','cancelled','no_show')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_appointments_branch_time ON appointments(branch_id, start_time);
CREATE INDEX idx_appointments_pet ON appointments(pet_id);

CREATE TABLE schedule_blocks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    branch_id   UUID NOT NULL REFERENCES clinic_branches(id),
    vet_user_id UUID REFERENCES users(id),
    start_time  TIMESTAMPTZ NOT NULL,
    end_time    TIMESTAMPTZ NOT NULL,
    reason      VARCHAR(200)
);

CREATE TABLE appointment_waitlist ( -- [FASE 2]
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    branch_id       UUID NOT NULL REFERENCES clinic_branches(id),
    pet_id          UUID NOT NULL REFERENCES pets(id),
    desired_from    TIMESTAMPTZ NOT NULL,
    desired_to      TIMESTAMPTZ NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting','offered','fulfilled','expired')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 8. INVENTARIO
-- ============================================================================

CREATE TABLE inventory_products (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    branch_id   UUID NOT NULL REFERENCES clinic_branches(id),
    name        VARCHAR(200) NOT NULL,
    category    VARCHAR(50),
    unit        VARCHAR(20),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_branch ON inventory_products(branch_id);

ALTER TABLE consultation_items
    ADD CONSTRAINT fk_item_product
    FOREIGN KEY (product_id) REFERENCES inventory_products(id);

CREATE TABLE inventory_lots ( -- [FASE 2]
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES inventory_products(id),
    lot_number      VARCHAR(100),
    expiration_date DATE,
    quantity        NUMERIC(10,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lots_expiration ON inventory_lots(expiration_date);

CREATE TABLE inventory_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID NOT NULL REFERENCES inventory_products(id),
    lot_id          UUID REFERENCES inventory_lots(id),
    quantity_delta  NUMERIC(10,2) NOT NULL,
    reason          VARCHAR(50) NOT NULL,
    reference_id    UUID,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders ( -- [FASE 2]
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID NOT NULL REFERENCES clinics(id),
    branch_id     UUID NOT NULL REFERENCES clinic_branches(id),
    supplier_name VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','received','cancelled')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE purchase_order_items ( -- [FASE 2]
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id),
    product_id          UUID NOT NULL REFERENCES inventory_products(id),
    quantity            NUMERIC(10,2) NOT NULL
);


-- ============================================================================
-- 9. FACTURACIÓN
-- ============================================================================

CREATE TABLE service_catalog (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    name        VARCHAR(200) NOT NULL,
    price       NUMERIC(10,2) NOT NULL
);

CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id       UUID NOT NULL REFERENCES clinics(id),
    branch_id       UUID NOT NULL REFERENCES clinic_branches(id),
    owner_id        UUID REFERENCES owners(id),
    pet_id          UUID REFERENCES pets(id),
    consultation_id UUID REFERENCES consultations(id),
    total           NUMERIC(10,2) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'paid'
                    CHECK (status IN ('pending','paid','cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_owner ON invoices(owner_id);
CREATE INDEX idx_invoices_clinic_date ON invoices(clinic_id, created_at);

CREATE TABLE invoice_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id  UUID NOT NULL REFERENCES invoices(id),
    service_id  UUID REFERENCES service_catalog(id),
    product_id  UUID REFERENCES inventory_products(id),
    description VARCHAR(200) NOT NULL,
    quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
    unit_price  NUMERIC(10,2) NOT NULL
);


-- ============================================================================
-- 10. CRM / RETENCIÓN [FASE 2]
-- ============================================================================

CREATE TABLE owner_preferences (
    owner_id             UUID PRIMARY KEY REFERENCES owners(id),
    preferred_channel    VARCHAR(20) DEFAULT 'whatsapp' CHECK (preferred_channel IN ('whatsapp','email','sms')),
    accepts_reminders    BOOLEAN NOT NULL DEFAULT false,
    accepts_reminders_at TIMESTAMPTZ
);

CREATE TABLE consultation_surveys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id),
    rating          SMALLINT CHECK (rating BETWEEN 1 AND 5),
    comments        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE owner_health_journal ( -- [FASE 3]
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id      UUID NOT NULL REFERENCES pets(id),
    owner_id    UUID NOT NULL REFERENCES owners(id),
    entry_text  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 11. COMUNICACIÓN / NOTIFICACIONES
-- ============================================================================

CREATE TABLE outbound_notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    owner_id    UUID REFERENCES owners(id),
    channel     VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp','email','sms')),
    template    VARCHAR(50),
    status      VARCHAR(20) NOT NULL DEFAULT 'sent'
                CHECK (status IN ('sent','delivered','failed')),
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE internal_notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    user_id     UUID NOT NULL REFERENCES users(id),
    type        VARCHAR(50) NOT NULL,
    message     TEXT NOT NULL,
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================================
-- 12. AUDITORÍA (transversal)
-- ============================================================================

CREATE TABLE audit_log (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id     UUID REFERENCES clinics(id),
    actor_type    VARCHAR(10) NOT NULL CHECK (actor_type IN ('user','owner','system')),
    actor_id      UUID NOT NULL,
    action        VARCHAR(50) NOT NULL,
    entity_type   VARCHAR(50) NOT NULL,
    entity_id     UUID NOT NULL,
    metadata_json JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);


-- ============================================================================
-- 13. FASE 3 — hospitalización, consentimientos, laboratorio
-- ============================================================================

CREATE TABLE hospitalization_records (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id        UUID NOT NULL REFERENCES pets(id),
    admitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    discharged_at TIMESTAMPTZ
);

CREATE TABLE hospitalization_vitals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospitalization_id  UUID NOT NULL REFERENCES hospitalization_records(id),
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    temperature         NUMERIC(4,1),
    notes               TEXT
);

CREATE TABLE digital_consents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID REFERENCES consultations(id),
    owner_id        UUID REFERENCES owners(id),
    signature_url   TEXT NOT NULL,
    pdf_url         TEXT NOT NULL,
    signed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE lab_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID REFERENCES consultations(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'ordered'
                    CHECK (status IN ('ordered','in_progress','completed')),
    result_url      TEXT,
    ordered_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);
```

---

## 6. Roadmap detallado por Fase y Subfase

> Recuerda la regla de la sección 0: presenta el plan de cada subfase y espera aprobación antes de ejecutarla.

### FASE 0 — Fundación técnica

- **0.1 — Setup del repositorio y esqueleto de proyecto**: estructura de carpetas backend (FastAPI) y frontend (React + Vite), configuración de entorno, conexión a PostgreSQL, variables de entorno, linter/formatter.
- **0.2 — Migraciones de base de datos**: crear todas las tablas del esquema de la sección 5 (incluye tablas marcadas FASE 2/3 — se crean desde ahora aunque no se usen todavía, para no rehacer migraciones después).
- **0.3 — Autenticación y middleware multi-tenant**: JWT, roles (`super-admin`, `admin`, `veterinario`, `recepcion`, `owner`), y el middleware que valida `subscription_status` de la clínica en cada request.
- **0.4 — Sistema de diseño base (design system)**: definir paleta de colores, tipografía, escala de espaciado, y componentes base reutilizables (botón, input, badge de estado, tarjeta, tabla) siguiendo la sección 4. Esto debe completarse ANTES de construir cualquier pantalla.

### FASE 1 — MVP

- **1.1 — Endpoints core del backend**: CRUD de `clinics`, `clinic_branches`, `users`, `pets`, `pet_weight_records`, `consultations`, `appointments`, `inventory_products`, `invoices`.
- **1.2 — Pantallas de autenticación**: Login / selección de rol, Activar cuenta con token (owner), Recuperación de contraseña (staff).
- **1.3 — Dashboard del día + Agenda**: vista de indicadores del día (citas, alertas de stock) + calendario día/semana con creación/reagendado, Detalle de cita, Bloqueo manual de horario.
- **1.4 — Ficha de paciente + Nueva consulta**: línea de tiempo, alta de nueva mascota, edición de datos, cálculo de dosis, captura de foto/nota, generación automática del PDF de resumen de consulta (sincronizado a la Cartilla digital).
- **1.5 — Inventario básico + Facturación básica**: alta de producto, lista con alertas de caducidad, descuento automático al facturar, detalle de factura/recibo, catálogo de servicios y precios.
- **1.6 — Configuración de clínica + Multi-sucursal**: gestión de usuarios/staff, gestión de sucursales (con inventario y agenda independientes por sucursal desde este punto), catálogo de servicios.
- **1.7 — Cartilla digital del dueño**: vista de solo lectura de vacunas/historial/último peso, foto compartida editable por el dueño (con límites de tamaño, compresión, limpieza EXIF, historial de foto anterior), flujo completo de invitación por token con reutilización de cuenta `owner` global.
- **1.8 — Panel Super-Admin**: lista de clínicas, estado de suscripción, switch activar/desactivar, detalle de clínica, alta manual de clínica nueva.
- **1.9 — Pantallas de cierre del MVP**: Perfil/configuración de cuenta propia (staff), Transferir/cambiar dueño de una mascota, Editor de plantillas de consulta (aunque las plantillas en sí son Fase 2, la pantalla puede construirse aquí si se decide adelantarla — confirmar con el usuario antes).

### FASE 2 — Secundarias

- **2.1 — Plantillas de consulta + Alertas clínicas visuales**
- **2.2 — Inventario avanzado**: lotes con FIFO por caducidad, predicción de agotamiento, órdenes de compra a proveedores.
- **2.3 — Agenda avanzada**: lista de espera + confirmación automática escalonada (48h/24h/2h).
- **2.4 — CRM básico + Encuestas + Comparador de fotos de evolución**
- **2.5 — Portal del dueño ampliado**: ver próximas citas, descargar facturas.
- **2.6 — Dashboard financiero**: con la regla de permisos por contenido (sección 3, punto 9).
- **2.7 — Centro de notificaciones internas + Bitácora/auditoría** (log de cambios: fotos, cancelaciones, ediciones).

### FASE 3 — Diferenciadores "wow"

- **3.1 — Transcripción/resumen de consulta por voz con IA**
- **3.2 — Consentimientos digitales firmados en tablet**
- **3.3 — Hospitalización (hoja de signos vitales por hora)**
- **3.4 — Laboratorio integrado**
- **3.5 — Dashboard de inteligencia de negocio** (top enfermedades, razas, predicción de horas pico)
- **3.6 — Diario de salud del dueño** (síntomas reportados antes de la cita)

---

## 7. Checklist maestro de TODAS las pantallas

### Fase 1 — MVP
1. Login / selección de rol
2. Activar cuenta con token (owner)
3. Recuperación de contraseña (staff)
4. Dashboard del día
5. Agenda (vista día/semana)
6. Detalle de cita
7. Bloqueo manual de horario
8. Ficha de paciente
9. Alta de nueva mascota
10. Editar datos del paciente
11. Nueva consulta
12. Ver consulta pasada
13. Resumen de consulta (PDF) — vista previa/descarga
14. Inventario (lista + alertas de caducidad)
15. Alta de producto/lote
16. Detalle/edición de producto
17. Facturación (generar cobro, historial)
18. Detalle de factura/recibo
19. Catálogo de servicios y precios
20. Configuración de clínica
21. Gestión de usuarios (staff)
22. Gestión de sucursales
23. Cartilla digital (vista del dueño)
24. Detalle de vacuna/estudio individual
25. Transferir/cambiar dueño de mascota
26. Perfil/configuración de cuenta propia (staff)
27. Panel Super-Admin: lista de clínicas
28. Panel Super-Admin: detalle de clínica
29. Panel Super-Admin: alta manual de clínica nueva

### Fase 2
30. Editor de plantillas de consulta
31. Vista de alertas clínicas en ficha de paciente
32. Inventario por lote (FIFO)
33. Órdenes de compra a proveedores
34. Lista de espera de citas
35. Perfil del dueño (CRM)
36. Encuesta post-consulta
37. Comparador de fotos de evolución
38. Portal del dueño: próximas citas
39. Portal del dueño: facturas descargables
40. Dashboard financiero (admin)
41. Centro de notificaciones internas
42. Bitácora/auditoría

### Fase 3
45. Transcripción por voz (integrada en Nueva consulta)
46. Consentimientos digitales (firma en tablet)
47. Hospitalización (hoja de signos vitales)
48. Laboratorio integrado (órdenes y resultados)
49. Dashboard de inteligencia de negocio
50. Diario de salud del dueño

---

## 8. Consideraciones especiales que NO debes pasar por alto

- **Cálculo de dosis en Nueva consulta**: un error aquí es un error médico real. Agrega validación adicional y, si es razonable, una confirmación manual del veterinario antes de guardar.
- **Foto compartida de la Cartilla digital**: límite de tamaño + compresión automática, formatos aceptados con conversión a uno único, aspect ratio fijo, limpieza automática de metadatos EXIF (ubicación GPS), y conservar la foto anterior para poder revertir si se sube algo inapropiado.
- **Suspensión de clínica**: la Cartilla digital del dueño debe pasar a modo solo-lectura, no bloqueo total — el dueño no debe perder acceso a datos de salud de su mascota por un impago que no es su responsabilidad.
- **Consentimiento WhatsApp**: nunca actives recordatorios automáticos sin opt-in explícito y registrado (`owner_preferences.accepts_reminders`).
- **Peso histórico vs. mostrado**: nunca lo trates como campo fijo del paciente; siempre como serie de tiempo, con el último valor como default visual.
- **PDF de resumen de consulta ≠ receta médica**: no le agregues elementos de legitimidad de prescripción.
- **Multi-sucursal**: no lo dejes como "un campo de texto" en configuración — debe afectar de verdad el filtrado de agenda e inventario desde el modelo de datos.
- **Identidad global del dueño**: al activar cualquier token de invitación, siempre busca primero un `owner` existente por teléfono/correo antes de crear uno nuevo.

---

**Recordatorio final para Claude Code:** este documento es exhaustivo a propósito. No omitas pasos por parecer "obvios" ni asumas atajos de UI genéricos. Ante cualquier duda de alcance dentro de una subfase, pregunta antes de construir.
