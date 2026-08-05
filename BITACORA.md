# Bitácora de desarrollo — VetCore

Registro de avance por subfase: qué se hizo, decisiones técnicas tomadas y por qué.

---

## Subfase 0.1 — Setup del repositorio y esqueleto de proyecto ✅

**Fecha:** 2026-08-05

### Qué se hizo
- Inicializado repositorio git (rama `main`) con `.gitignore` raíz.
- Creado `docker-compose.yml` con PostgreSQL 16 (contenedor `vetcore-db`, volumen persistente `vetcore_pgdata`).
- Creado backend FastAPI con estructura: `app/core/`, `app/db/`, `app/models/`, `app/schemas/`, `app/api/`.
- Creado frontend React + Vite (TypeScript) con estructura `src/components`, `src/pages`, `src/styles`, `src/lib`.
- Configurado `.env.example` y `.env` con todas las variables del stack (DB, JWT, R2).
- Creado `README.md` raíz, `backend/README.md` y `frontend/README.md`.
- Endpoint de salud `/api/v1/health` que verifica conexión a la base de datos.
- Linter/formatter: Ruff (backend) y ESLint + Prettier (frontend).

### Decisiones técnicas y por qué
- **Puertos:** PostgreSQL en **5433** (el 5432 estaba ocupado por otro servicio del usuario), backend en **8001** (8000 ocupado), frontend en **5173** (default de Vite).
- **JWT propio** (python-jose + passlib) en lugar de Auth0/Clerk: sin costo, sin dependencia de terceros, control total. Decidido con el usuario.
- **Cloudflare R2** para storage de media: configurado ya en `.env` (se usará desde Fase 1.4). Decidido con el usuario.
- **docker-compose v1 (legacy):** el entorno del usuario no tiene el plugin `docker compose` v2, así que se usa `docker-compose` y se agregó `version: "3.8"` al archivo para compatibilidad.
- **Base ORM:** SQLAlchemy 2.0 con `psycopg` v3 (driver nativo y moderno). Las tablas se modelarán en la Subfase 0.2.
- **Ruff** como linter+formatter del backend (estándar moderno de FastAPI). **ESLint + Prettier** en frontend (el template de Vite traía oxlint por default, pero se reemplazó para respetar el plan aprobado).
- **Proxy en Vite:** `/api` → `http://localhost:8001` para que el frontend no tenga que saber la URL del backend en desarrollo.

### Verificado
- `docker-compose up -d` levanta PostgreSQL 16 en 5433 con healthcheck ✓
- `ruff check .` y `ruff format --check .` pasan sin errores ✓
- Backend arranca y `/api/v1/health` responde `{"status":"ok","database":"connected"}` ✓
- Frontend: `npm run lint` (ESLint) pasa ✓, Prettier formatea sin errores ✓, `npm run build` compila ✓

### Notas / pendientes
- El frontend tiene un placeholder visual mínimo; el design system se construye en la Subfase 0.4 (por orden del documento, no se adelanta).
- Las variables de R2 quedan vacías intencionalmente hasta que el usuario provea credenciales.

---

## Subfase 0.2 — Migraciones de base de datos ✅

**Fecha:** 2026-08-05

### Qué se hizo
- Instalado **Alembic 1.14** como motor de migraciones y agregado a `requirements.txt`.
- Configurado `alembic.ini`, `alembic/env.py` (conectado a `app.core.config` para leer la URL de la DB) y `alembic/script.py.mako`.
- Creada migración inicial `0001_initial_schema.py` con **el SQL de la sección 5 del documento maestro ejecutado textualmente** (incluye tablas FASE 2 y FASE 3, como ordena el documento).
- Ejecutada con `alembic upgrade head`.

### Decisiones técnicas y por qué
- **Alembic sobre script SQL suelto:** el documento dice "ejecuta el esquema tal cual", pero tener un sistema de migraciones versionado permite evolucionar el esquema en subfases futuras sin recrear la DB desde cero. La migración inicial conserva el SQL exacto del documento (sin reinterpretación), así el esquema del documento sigue siendo la fuente de verdad.
- **`gen_random_uuid()`:** disponible nativamente en PostgreSQL 16, no se requiere la extensión `pgcrypto` (solo era necesaria antes de PG13).
- **Downgrade con `DROP TABLE ... CASCADE`** en orden inverso: permite revertir la migración inicial por completo en un entorno de desarrollo.
- **No se crearon modelos ORM** en esta subfase: eso corresponde a la Subfase 1.1 (regla 4 del documento: no adelantar trabajo de subfases futuras).

### Verificado
- `alembic upgrade head` ejecuta sin errores ✓
- **39 tablas** en la base: 38 del esquema + `alembic_version` ✓
- Los `ALTER TABLE` del esquema (FK `fk_weight_consultation` y `fk_item_product`) quedaron creados correctamente ✓
- `alembic current` → `0001_initial_schema (head)` ✓
- Ruff pasa sin errores ✓

### Notas / pendientes
- La tabla `users` convive con los roles `admin`, `veterinario`, `recepcion`. El rol `super-admin` y el `owner` son tablas/identidades separadas (según diseño del documento) — se modelan en Subfase 0.3.

---

**Siguiente subfase:** 0.3 — Autenticación y middleware multi-tenant (JWT, roles, y validación de `subscription_status` en cada request).
