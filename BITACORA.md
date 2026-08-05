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

## Subfase 0.3 — Autenticación y middleware multi-tenant ✅

**Fecha:** 2026-08-05

### Qué se hizo
- Creada tabla `super_admins` (migración `0002`) para la identidad del dueño del producto.
- `app/core/security.py`: hashing bcrypt + creación/decodificación de JWT.
- `app/api/deps.py`: `get_current_user`, guard por rol (`require_roles`, `require_staff`) y `get_current_clinic` que valida `subscription_status` en cada request protegido.
- `app/api/auth.py`: `POST /auth/login` (staff), `/auth/login/owner`, `/auth/login/super-admin`, `GET /auth/me`, y endpoint demo `GET /auth/clinic-check` para probar el middleware.
- Seed idempotente `scripts/seed_super_admin.py` (lee `SUPER_ADMIN_*` del `.env`).
- Variables `SUPER_ADMIN_*` agregadas a `.env` y `.env.example`.

### Decisiones técnicas y por qué
- **Tabla `super_admins` (agregada al esquema del documento):** el documento define el rol `super-admin` pero su esquema no tiene dónde guardar sus credenciales. Se creó una tabla pequeña en DB (aprobada por el usuario en el plan) en vez de hardcodear credenciales: consistente con el resto del sistema, auditable y extensible.
- **Tokens por identidad:** `sub` + `role` siempre; `clinic_id`/`branch_id` solo para staff. Los tokens de `owner` no llevan `clinic_id` (identidad global, principio 2). El rol del token es informativo; los permisos se re-validan contra la DB.
- **Middleware como dependencia FastAPI (`get_current_clinic`):** se aplica ruta por ruta, más flexible y testeable que un middleware global de Starlette. Devuelve `CurrentClinic` (dataclass con `user` + `clinic`) para que los endpoints futuros de la Subfase 1.1 tengan ambas cosas.
- **Pin `bcrypt==4.0.1`:** bcrypt 5.x rompe `passlib` 1.7.4 (error conocido `__about__`). Se fijó la versión compatible.
- **SQL directo (no ORM) en login/validación:** los modelos SQLAlchemy son de la Subfase 1.1; para no adelantar trabajo se consulta con `text()`.
- **Ruff B008:** `Depends()` en defaults es el patrón oficial de FastAPI; se configuró `extend-immutable-calls` en lugar de silenciar la regla globalmente.

### Verificado
- Login super-admin devuelve token; `/auth/me` devuelve la identidad correcta ✓
- Sin token → 401; token inválido → 401; password incorrecta → 401 ✓
- Staff de clínica activa pasa `clinic-check` con su `clinic_id` ✓
- Staff de clínica **suspendida** → 403 "Suscripción de la clínica no activa" ✓
- Owner inexistente → 401 ✓
- `/docs` (Swagger) responde 200 ✓
- Ruff pasa sin errores ✓

### Notas / pendientes
- Quedan datos de prueba en la DB de desarrollo: clínica "Clínica Test" (activa) con `admin@test.com`/`<redactado>`, y "Clínica Suspendida" con `vet@susp.com`/`<redactado>`. Útiles para validar las subfases siguientes; se pueden eliminar antes de producción.
- El flujo de invitación por token del owner NO se construye aquí (es 1.2/1.7, por orden del documento).

---

## Subfase 0.4 — Sistema de diseño base (design system) ✅

**Fecha:** 2026-08-05

### Qué se hizo
- Configurado **Tailwind CSS v4** (plugin Vite) + **shadcn/ui** (estilo new-york, Radix).
- Definidos los **tokens de diseño** en `src/styles/index.css` (paleta, tipografía, espaciado, radios, sombras, colores de gráficas).
- Agregados componentes base shadcn: `Button`, `Input`, `Badge`, `Card`, `Table`, `Dialog`, `Select`, `Label`, `Textarea`, `Separator`, `Skeleton`.
- Creados **estados diseñados**: `EmptyState`, `LoadingState`, `ErrorState` (requisito de la sección 4: sin placeholders genéricos).
- Página de preview `src/pages/DesignSystem.tsx` que muestra todos los componentes con su uso.
- Alias `@/*` → `src/*` en Vite y TypeScript.
- Fuente **Inter** cargada desde Google Fonts.

### Decisiones técnicas y por qué
- **Tailwind v4 + shadcn/ui (aprobado por el usuario):** acelera consistencia visual con componentes accesibles (Radix) y 100% customizables. El documento (sección 4) recomienda evaluar esta librería.
- **Paleta "teal clínico" (aprobada por el usuario):** primario `#0f766e` (teal profundo) sobre neutros con ligero tinte cálido-verde (`#f6f9f8`). Transmite salud/cuidado, se aleja del look "admin panel genérico" y del Bootstrap default. Incluye variantes semánticas `success/warning/info` para badges de estado y 5 colores `chart-*` para las gráficas de los Dashboards (Fase 2).
- **Tipografía Inter** (sugerida por el documento) con jerarquía base en `@layer base` (h1-h4, selection, etc.).
- **Espaciado en múltiplos de 4px** (escala default de Tailwind, cumple la regla del documento).
- **Radios y sombras propios:** `--radius` 0.625rem escalado (sm/md/lg/xl) y sombras `card/elevated/dialog` suaves — sin las "sombras genéricas" de template.
- **Modo oscuro incluido** en los tokens (`.dark`) aunque el producto arranca en claro: es gratis de mantener y útil para el futuro.
- **shadcn colocó los archivos en `@/` literal** por el CLI v4; se movieron a `src/components/ui/` donde corresponde.
- **`import.meta.dirname`** en vite.config (Vite 8 depreca `__dirname` en el config loader nativo).

### Verificado
- `npm run lint` pasa (solo 2 warnings de react-refresh, patrón estándar de shadcn: export de `cva` junto al componente) ✓
- `npm run build` compila (1902 módulos, tsc + vite OK) ✓
- Dev server responde HTTP 200 con el título "VetCore — Gestión Veterinaria" ✓
- Prettier formatea sin errores ✓

### Notas / pendientes
- La página `DesignSystem` es transitoria; se reemplazará cuando existan las pantallas reales (el routing se introduce en la Subfase 1.2).
- El dark mode está disponible en tokens pero no habrá toggle por ahora.

---

## Subfase 1.1 — Endpoints core del backend ✅

**Fecha:** 2026-08-05

### Qué se hizo
- **Modelos ORM SQLAlchemy 2.0** (`app/models/`): `Clinic`, `ClinicBranch`, `User`, `Pet`, `PetWeightRecord`, `Consultation`+`ConsultationItem`, `Appointment`, `InventoryProduct`, `Invoice`+`InvoiceItem`, con mixins `UUIDPkMixin`/`TimestampMixin`.
- **Schemas Pydantic** Create/Update/Read por entidad (`app/schemas/`).
- **Routers CRUD** (`app/api/`): clinics (super-admin), branches, users, pets (+pesos), consultations, appointments, inventory, invoices.
- Helper `require_clinic_roles(*roles)` en `deps.py` que combina validación de suscripción + chequeo de rol.
- Registro Core (`app/models/_references.py`) de tablas referenciadas por FK sin modelo propio aún.

### Decisiones técnicas y por qué
- **Modelos = reflejo exacto del DDL:** la migración 0001 (SQL del documento) sigue siendo la fuente de verdad; los modelos solo replican el esquema para el ORM. No se usa `alembic autogenerate`.
- **Matriz de permisos** aplicada (aprobada en el plan):
  - `clinics` → solo super-admin (sin tenant).
  - `branches`, `users` → admin muta, staff lee.
  - `pets`/pesos, `consultations`, `inventory` → admin+veterinario mutan, staff lee.
  - `appointments` → todo el staff.
  - `invoices` (dinero, sección 3.9) → solo admin, incluso para leer.
- **Aislamiento multi-tenant duro:** cada query filtra por `clinic_id` del token. Los `GET /{id}` devuelven 404 (no 403) cuando el recurso no pertenece a la clínica — no filtra información de existencia.
- **Total de factura calculado en servidor** (`_compute_total`), nunca se confía en el total del cliente.
- **Soft-deletes:** clínica → `subscription_status='cancelled'`; usuario y mascota → `is_active=false`; factura → `status='cancelled'` (integridad financiera). Sucursal y producto usan hard-delete con 409 si hay dependencias FK.
- **`require_clinic_roles` registrado en `extend-immutable-calls`** de Ruff (patrón factory de dependencias de FastAPI).
- **Registro Core de tablas sin modelo** (`owners`, `consultation_templates`, `service_catalog`): SQLAlchemy necesita las tablas de destino de las FK en el metadata para ordenar las operaciones de flush. Se registran como `Table` Core sin clases ORM (los modelos llegan en 1.5/1.7/2.1).

### Verificado
- CRUD completo en Clínica Test: sucursal, mascota, peso (con `latest_weight_kg` en la lectura), consulta con items, cita, producto, factura con items ✓
- Total de factura calculado en servidor: 450.50 + 2×350.25 = **1151.00** ✓
- **Aislamiento:** admin de Clínica Beta ve 0 mascotas/facturas de Clínica Test; al acceder por id → 404 ✓
- **Roles:** recepción → 403 en facturas y alta de mascotas; 201 en citas; 200 al listar pacientes ✓
- Super-admin crea clínica y lista las 3 clínicas ✓
- Ruff pasa sin errores ✓

### Notas / pendientes
- **Gap detectado:** no hay endpoint para crear el PRIMER admin de una clínica (chicken-egg: los users los crea el admin). El flujo de onboarding super-admin → primer admin se resuelve en la Subfase 1.8 (Panel Super-Admin). Para pruebas se creó el admin de Clínica Beta directo en DB.
- Datos de prueba nuevos en dev: Clínica Beta (`admin@beta.com`/`<redactado>`), recepcionista (`recepcion@test.com`/`<redactado>`), mascota "Firulais" con peso, consulta, cita, producto y factura.
- No se modelaron `owners`, `consultation_templates`, `service_catalog` (son 1.7, 2.1, 1.5) — solo su registro Core para las FKs.

---

**Siguiente subfase:** 1.2 — Pantallas de autenticación (Login/selección de rol, Activar cuenta con token del owner, Recuperación de contraseña). Aquí se introduce el routing del frontend.
