"""Crear esquema inicial completo del Sistema de Gestión Veterinaria.

Basado en la sección 5 de INSTRUCCIONES-PROYECTO.md. El SQL se ejecuta tal cual
aparece en el documento (fuente de verdad). Incluye tablas marcadas FASE 2/3.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-08-05

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INITIAL_SCHEMA = """
-- ============================================================================
-- ESQUEMA DE BASE DE DATOS — Sistema de Gestión Veterinaria (SaaS multi-tenant)
-- PostgreSQL
-- ============================================================================

-- 0. SUPER-ADMIN / CLÍNICAS (tenants)
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
    event_type  VARCHAR(30) NOT NULL,
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

-- 1. STAFF DE LA CLÍNICA (por clínica, NO global)
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

-- 2. IDENTIDAD DEL DUEÑO (GLOBAL — sin clinic_id)
CREATE TABLE owners (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone                   VARCHAR(30) UNIQUE,
    email                   VARCHAR(200) UNIQUE,
    password_hash           TEXT,
    profile_photo_url       TEXT,
    profile_photo_prev_url  TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. PACIENTES (mascotas) — por clínica
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

-- 4. VINCULACIÓN DUEÑO ↔ MASCOTA E INVITACIONES POR TOKEN
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

CREATE INDEX idx_invitations_token ON owner_invitations(token);

-- 5. CONSULTAS
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
    annotation_json JSONB,
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

-- 6. ALERTAS CLÍNICAS [FASE 2]
CREATE TABLE clinical_alerts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pet_id      UUID NOT NULL REFERENCES pets(id),
    type        VARCHAR(30) NOT NULL,
    description TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. AGENDA
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

-- 8. INVENTARIO
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

CREATE TABLE inventory_kits ( -- [FASE 2]
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id   UUID NOT NULL REFERENCES clinics(id),
    name        VARCHAR(150) NOT NULL
);

CREATE TABLE inventory_kit_items ( -- [FASE 2]
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id      UUID NOT NULL REFERENCES inventory_kits(id),
    product_id  UUID NOT NULL REFERENCES inventory_products(id),
    quantity    NUMERIC(10,2) NOT NULL
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

-- 9. FACTURACIÓN
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

-- 10. CRM / RETENCIÓN [FASE 2]
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

-- 11. COMUNICACIÓN / NOTIFICACIONES
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

-- 12. AUDITORÍA (transversal)
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

-- 13. FASE 3 — hospitalización, consentimientos, laboratorio
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
"""

ALL_TABLES = [
    "clinic_subscription_events",
    "clinic_branches",
    "users",
    "owners",
    "pet_weight_records",
    "owner_pet_links",
    "owner_invitations",
    "consultation_templates",
    "consultations",
    "consultation_attachments",
    "consultation_items",
    "consultation_summary_pdfs",
    "clinical_alerts",
    "appointments",
    "schedule_blocks",
    "appointment_waitlist",
    "inventory_products",
    "inventory_lots",
    "inventory_movements",
    "inventory_kits",
    "inventory_kit_items",
    "purchase_orders",
    "purchase_order_items",
    "service_catalog",
    "invoices",
    "invoice_items",
    "owner_preferences",
    "consultation_surveys",
    "owner_health_journal",
    "outbound_notifications",
    "internal_notifications",
    "audit_log",
    "hospitalization_records",
    "hospitalization_vitals",
    "digital_consents",
    "lab_orders",
    "pets",
    "clinics",
]


def upgrade() -> None:
    op.execute(INITIAL_SCHEMA)


def downgrade() -> None:
    for table in ALL_TABLES:
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
