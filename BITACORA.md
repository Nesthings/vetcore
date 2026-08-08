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

## Subfase 1.2 — Pantallas de autenticación ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Migración `0003`: tabla `password_reset_tokens`.
- Endpoints nuevos en `auth.py`:
  - `POST /auth/activate-token` — activación de cuenta del owner con el token de invitación (crea o **reutiliza** el owner global y vincula la mascota).
  - `POST /auth/forgot-password` — genera token de reset (30 min de expiración).
  - `POST /auth/reset-password` — nueva contraseña con token (una sola vez).

**Frontend:**
- `react-router-dom` (BrowserRouter) + cliente API `src/lib/api.ts` + contexto de sesión `src/lib/auth.tsx` (persistencia en localStorage).
- `AuthLayout` + páginas: `Login` (tabs Clínica/Dueño/Super Admin), `Activate`, `ForgotPassword`, `ResetPassword`.
- `ProtectedRoute` (guard de rutas autenticadas) + `SessionHome` (placeholder post-login por rol).
- `App.tsx` ahora es el Router; `/design-system` se conserva como herramienta de dev.
- Componente shadcn `Tabs` agregado.

### Decisiones técnicas y por qué
- **Tabla `password_reset_tokens` (nueva, aprobada):** el esquema del documento no contempla reset de contraseña; se agregó con token único, expiración de 30 min y `used_at` (una sola vez).
- **Activación de token en 1.2:** la pantalla "Activar cuenta" necesita su endpoint para ser funcional. La generación de invitaciones y la Cartilla completa quedan para 1.7. La lógica de activación sigue textualmente los pasos de la sección 5: validar token → buscar owner por phone/email → reutilizar o crear → crear link → marcar usado.
- **Regla de identidad global aplicada:** al activar un segundo token con el mismo email, el `owner` se reutiliza (nunca se duplica). El `ON CONFLICT (owner_id, pet_id) DO UPDATE` mantiene el link único por pareja.
- **Recuperación de contraseña solo para staff** (`users`), según el documento. En dev el reset token se devuelve en la respuesta (no hay servicio de email); en producción sería por correo/WhatsApp.
- **Login unificado con tabs** (checklist "Login / selección de rol"): misma pantalla, tres endpoints de login según la pestaña.
- **Cliente API con relativo `/api/v1`:** aprovecha el proxy de Vite en dev y la misma URL en prod; manejo de 401 (limpia el token) y errores tipados.
- **Decodificación del JWT en el cliente solo para UI** (role/clinic_id); la autorización real sigue siendo del backend.

### Verificado
- Activar token → crea owner + link y devuelve token de owner; login posterior OK ✓
- Token ya usado → 400 "Este token ya fue utilizado" ✓
- **Identidad global:** 2 activaciones con el mismo email → **1 solo owner** ✓
- forgot-password devuelve token (dev); reset-password 204; login con la nueva contraseña OK; reuso del token → 400 ✓
- `npm run build` compila (0 errores); dev server responde y HMR aplica los cambios ✓

### Notas / pendientes
- ⚠️ La contraseña de `admin@test.com` cambió a **`<redactado>`** durante la prueba de reset (era `<redactado>`).
- Credenciales dev útiles: super-admin `admin@vetcore.app`/`<redactado>`; owner `owner@test.com`/`<redactado>`; recepción `recepcion@test.com`/`<redactado>`.
- Datos de prueba: 2 invitaciones usadas del owner; mascota Firulais.
- El flujo de *generación* de invitaciones (token al dar de alta mascota, envío WhatsApp) y la Cartilla completa son de la Subfase 1.7.

---

## Fix — Doble prefijo `/api/v1` en las llamadas del frontend (Subfase 1.2)

**Fecha:** 2026-08-05

### Bug
Al iniciar sesión con cualquier rol, la app mostraba **"Not Found"**. Causa: `apiFetch()` en `src/lib/api.ts` antepone `BASE_URL = '/api/v1'` a la ruta, y las páginas pasaban rutas que **ya incluían** `/api/v1` (`'/api/v1/auth/login'`). Resultado: la app pedía `/api/v1/api/v1/auth/login` → 404.

El log del backend lo evidenciaba: `POST /api/v1/api/v1/auth/login 404`. Mis pruebas de la subfase no lo detectaron porque usé `curl` directo al backend (no ejecuta el JS del frontend).

### Corrección
Normalizar los callers para que pasen la ruta sin el prefijo (que ya lo agrega `apiFetch`):
- `Login.tsx`: `ROLE_TARGETS` → `/auth/login`, `/auth/login/owner`, `/auth/login/super-admin`
- `Activate.tsx` → `/auth/activate-token`
- `ForgotPassword.tsx` → `/auth/forgot-password`
- `ResetPassword.tsx` → `/auth/reset-password`

### Verificado
- `npm run lint` 0 errores; `npm run build` OK ✓
- Vía el proxy de Vite (`:5173`): `POST /api/v1/auth/login` con credenciales de staff → **200** ✓
- El log del backend ya no muestra el doble prefijo ✓

### Lección anotada
Las verificaciones de frontend deben ejercitar el código JS real (no solo el backend con curl). A partir de aquí, al verificar subfases con frontend, probar también el flujo a través del navegador/proxy.

---

## Subfase 1.3 — Dashboard del día + Agenda ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Modelo `ScheduleBlock` + CRUD en `app/api/schedule_blocks.py` (listar por rango, crear, editar, eliminar).
- Modelo `InventoryMovement` (faltaba; su tabla existía). El stock se deriva de la suma de `quantity_delta`.
- `GET /dashboard/day`: KPIs de citas por estado, citas por hora (7-20), bloques del día, alertas de stock (productos bajo umbral) y pacientes activos. **Operativo, sin cifras de dinero** (regla sección 3.9).
- Citas enriquecidas con `pet_name`, `vet_name`, `branch_name` (joins en el endpoint) — la agenda los necesita.

**Frontend:**
- `recharts` instalado (aprobado) para la gráfica de citas por hora.
- `AppLayout` (sidebar + topbar) — el shell del panel clínico; reemplaza al `SessionHome` para staff.
- `Dashboard` (KPIs, gráfica de barras, alertas de stock, lista de citas del día).
- `Agenda` día/semana construida a medida: grid de horas 7-20, citas posicionadas, bloques de horario, selector de sucursal, navegación prev/next/hoy.
- Diálogos: `AppointmentFormDialog` (nueva cita), `AppointmentDetailDialog` (detalle + cambios de estado + reagendar), `BlockFormDialog` (bloquear horario).
- Rutas: `/` → Dashboard, `/agenda` → Agenda (protegidas).

### Decisiones técnicas y por qué
- **Agenda a medida (aprobada), no librería de calendario:** cumple la regla de la sección 4 (no verse como template genérico) y se integra con el design system.
- **Reagendar solo por diálogo (aprobado):** editar fecha/hora y estado desde el detalle; sin drag & drop (más simple y robusto para MVP).
- **Alertas de stock vía movimientos:** `inventory_products` no tiene campo de stock y los lotes son FASE 2; `inventory_movements` sí es MVP, así que stock = Σ deltas. Umbral configurable (default 5).
- **Dashboard operativo sin dinero:** los ingresos son exclusivos del admin en el Dashboard financiero (2.6).
- **Horas del grid 7:00–20:00** (horario típico de clínica). Las citas fuera de rango se muestran igual (la UI usa hora local del navegador).
- **`react-hooks/set-state-in-effect` desactivada:** regla nueva (v7) demasiado agresiva; marca como error el patrón legítimo de fetch en `useEffect` y reset de dialogs al abrir. Documentado en `eslint.config.js`.
- **Zona horaria:** el servidor corre en UTC; los datos de prueba se sembraron a horas UTC que se ven en el horario laboral de México (UTC-6).

### Verificado
- CRUD de bloques: crear/listar por rango ✓
- Citas enriquecidas: `[('Firulais', 'Consulta', 'Sucursal Centro')]` ✓
- Dashboard: 3 citas hoy, por estado `scheduled`, bloques, stock (con stock 6 y umbral 5 → sin alertas; correcto) ✓
- Lint 0 errores (solo warnings conocidos de react-refresh) + build OK ✓
- Todos los módulos del frontend transforman vía dev server (HTTP 200) ✓
- Recharts agrega ~380 kB al bundle (warning de chunk size; code-split posible en el futuro)

### Notas / pendientes
- Datos de prueba para hoy: 3 citas de Firulais (9:00, 11:30, 14:00 hora México) + 1 bloqueo en el 06.
- El drag & drop de la agenda quedó fuera (decisión aprobada); se puede añadir después si se quiere.
- `/portal` (owner) y `/super-admin` siguen con `SessionHome` hasta 1.7 y 1.8.

---

## Subfase 1.4 — Ficha de paciente + Nueva consulta ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- `reportlab` agregado (generación de PDF).
- `app/core/storage.py`: servicio de media **local** (`MEDIA_ROOT`, URL pública `/media/...`) con interfaz preparada para migrar a R2.
- `POST /dose/calc`: cálculo de dosis (volumen = peso × dosis ÷ concentración), única fuente de verdad.
- `GET /pets/{id}/timeline`: fusiona consultas y citas del paciente en orden cronológico.
- `POST /pets/{id}/photo`: sube la foto CLÍNICA del expediente (campo distinto del de la Cartilla, principio 5).
- `POST /consultations/{id}/summary-pdf`: genera/regenera el PDF de resumen (informativo, NO receta — principio 6) con `reportlab` y lo registra en `consultation_summary_pdfs`.
- `POST /consultations/{id}/attachments`: subida multipart de foto/nota → `consultation_attachments`.
- Modelos `ConsultationAttachment` y `ConsultationSummaryPdf`.
- `/media` montado con StaticFiles.
- Validación de extensiones (imágenes: jpg/jpeg/png/webp) y límite de 5 MB.

**Frontend:**
- `Pets` (listado con búsqueda + alta) y `PetFormDialog`.
- `PetDetail`: ficha con foto, alertas, alergias, **línea de tiempo** y **gráfica de peso histórico** (recharts).
- `NewConsultation`: motivo/diagnóstico/tratamiento/indicaciones, próxima cita, sucursal, **peso nuevo**, **calculadora de dosis con confirmación obligatoria**, items, subida de foto → al guardar genera el PDF automáticamente y lo ofrece para descargar.
- Nav "Pacientes" + rutas `/pets`, `/pets/:id`, `/pets/:id/consultas/nueva`.

### Decisiones técnicas y por qué
- **Storage local ahora, R2 después (aprobado):** fotos y PDFs en `backend/media/`. El servicio `storage.py` abstrae guardar/URL pública para que la migración a R2 no toque endpoints. `MEDIA_ROOT` en `.env`.
- **PDF informativo (reportlab):** contiene qué se hizo, qué se aplicó e indicaciones; el footer dice explícitamente "no constituye una receta médica" (regla 6).
- **Dosis en backend:** la fórmula vive en un solo lugar (testeable). La UI muestra la fórmula y **bloquea el guardado** si no hay confirmación explícita cuando hay un cálculo (regla sección 8).
- **Peso como serie de tiempo:** el pesaje se vincula a la consulta (`consultation_id`) y se guarda en `pet_weight_records`; el default visual es el último valor (principio 4).
- **Límites y validación de uploads:** 5 MB y extensiones permitidas; el endpoint devuelve 413 si se excede.

### Verificado
- `POST /dose/calc`: 12.5kg × 5mg/kg ÷ 50mg/ml → 62.5 mg / 1.25 ml ✓
- Timeline fusiona 1 consulta + 3 citas en orden ✓
- Upload de foto clínica → `/media/pets/...` sirve HTTP 200 ✓
- PDF: generado, descargable como `application/pdf` (encabezado `%PDF`) ✓
- Consulta completa por API (items + peso vinculado + PDF + adjunto): peso último actualizado a 12.8 ✓
- Lint 0 errores (solo warnings conocidos) + build OK ✓

### Notas / pendientes
- La foto de la Cartilla digital del dueño (regla 5) es un campo distinto y llega en la Subfase 1.7.
- Los PDFs y fotos viven en disco local; R2 se integra cuando el usuario provea credenciales.
- El adjunto de video/audio de la consulta queda pendiente (tipo en el esquema, pero la UI solo sube fotos por ahora).
- `annotation_json` de adjuntos es FASE 2 (anotaciones sobre la foto).

---

## Subfase 1.5 — Inventario básico + Facturación básica ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Migración `0004`: `discount_percent` en `invoice_items` y `service_catalog`.
- Modelos reales `ServiceCatalog` e `InventoryLot` (se retiró el registro Core de `service_catalog`).
- `api/services.py`: CRUD del catálogo de servicios (solo admin).
- `api/inventory.py`: listado enriquecido con **stock** (Σ movimientos) y **alertas de caducidad** (vence ≤30 días / vencido); alta de producto, alta de lote (crea entrada de compra), movimiento manual de stock.
- `api/invoices.py`: total con **descuento automático por servicio del catálogo**, descuento por línea editable, **movimiento de venta automático** al facturar productos (descuenta stock), **PDF de recibo** (`GET /invoices/{id}/receipt`), lectura enriquecida con `pet_name`/`branch_name` y `line_total`.

**Frontend:**
- Nav: **Inventario**, **Servicios**, **Facturación** (los dos últimos solo visibles para admin).
- `Inventory`: tabla con badges de stock (agotado/bajo/en stock) y caducidad (vence pronto/vencido); alta de producto, lote y movimiento.
- `Services`: catálogo con precio y descuento automático.
- `Invoices`: lista con folio/paciente/total/estado, alta con editor de conceptos (servicios del catálogo con descuento automático, productos o manual), detalle y **descarga del recibo PDF** (fetch con token → blob).

### Decisiones técnicas y por qué
- **Descuento automático por servicio (aprobado):** el descuento vive en el catálogo; al facturar una línea con `service_id` y sin descuento explícito, el backend lo toma del catálogo. El admin puede ajustarlo por línea. Total recalculado en servidor.
- **Caducidad con lotes** (`inventory_lots`, marcado FASE 2 en el esquema pero necesario para 1.5): producto → lotes con fecha; alerta a ≤30 días o vencido.
- **Stock por movimientos:** el alta de lote crea un movimiento `purchase`; al facturar un producto, un movimiento `sale` negativo descuenta stock automáticamente (consistente con el dashboard).
- **`service_catalog` sin `created_at`:** el esquema del documento NO lo tiene; se respetó tal cual (se descubrió al fallar el INSERT).
- **Recibo vía `GET /invoices/{id}/receipt`** (no almacenado en DB): el frontend lo descarga con el token (fetch→blob) para no exponer la URL.
- **Roles:** servicios y facturas = solo admin (backend 403 + nav oculto); inventario = admin/vet.

### Verificado
- Servicio con 10% de descuento; factura con 1 servicio + 2 productos → total 645.00 (405 + 240), dto 10% aplicado automáticamente ✓
- Stock tras la venta: 20 − 2 = 18 ✓
- Lote con caducidad 2026-09-01 → `expiring_soon: true` ✓
- Recibo PDF: HTTP 200, `%PDF` ✓
- Admin: servicios/facturas 200; recepción: 403 en ambos ✓
- Ruff + lint 0 errores, build OK ✓

### Notas / pendientes
- Datos de prueba nuevos: servicio "Consulta general" (450, 10%), producto "Amoxicilina 250mg" con lote (20 uds, vence 2026-09-01), facturas con recibo.
- El `discount_percent` de `service_catalog` es una adición al esquema (migración 0004) aprobada como parte de la decisión de descuento.

---

## Subfase 1.6 — Configuración de clínica + Multi-sucursal ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend (menor):**
- `users` enriquecido con `branch_name` (listado y detalle).

**Frontend:**
- `Settings` (`/settings`, solo admin): tabs **Usuarios** (tabla del staff, alta/edición, activar/desactivar) y **Sucursales** (tabla, alta/edición, eliminar con 409 si tiene registros) + enlace al catálogo de servicios.
- `UserFormDialog` (alta/edición de staff: rol, sucursal, contraseña) y `BranchFormDialog`.
- Nav **Configuración** (solo admin).
- **Selector de sucursal en Inventario** → el inventario se filtra por sucursal (independencia visible; la agenda ya lo tenía desde 1.3).
- `ProtectedRoute` ahora acepta `roles` → las rutas admin-only (`/services`, `/invoices`, `/settings`) muestran una pantalla de "Acceso restringido" si un rol no permitido navega directo a la URL.

### Decisiones técnicas y por qué
- **Configuración centralizada con tabs** (aprobado): una sola página para staff y sucursales, como agrupa el checklist 20-22.
- **Servicios se queda en `/services`** (aprobado): desde Configuración solo se enlaza.
- **Multi-sucursal visible:** agenda (1.3) e inventario filtran por `branch_id`; el modelo ya lo hacía desde 1.1.
- **Backend: lectura de staff abierta a todo el staff** (matriz 1.1 aprobada: "staff lee"); las mutaciones de users/branches siguen siendo solo admin (403). El control fino de la UI se hace con el guard de roles del frontend.
- **`confirm()` nativo** para eliminar sucursal (simple, sin librería de dialogs extra).

### Verificado
- `users` devuelve `branch_name` ("Dr. Test | admin | Sucursal Centro") ✓
- Alta de sucursal nueva ✓; inventario filtrado por sucursal (3 productos en la 1ª) ✓
- Recepción: backend devuelve 403 al intentar mutar users; la UI bloquea `/services`, `/invoices`, `/settings` ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Datos de prueba: sucursal "Sucursal Norte" creada.
- El Panel Super-Admin (1.8) gestionará clínicas; la configuración aquí es a nivel clínica.

---

## Subfase 1.7 — Cartilla digital del dueño + Invitación por token ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Migración `0005`: `cartilla_photo_url` + `cartilla_photo_prev_url` en `pets` (principio 5: foto de la Cartilla ≠ foto clínica).
- `Pillow` agregado. `app/core/images.py`: conversión a JPEG, crop cuadrado centrado (aspect ratio fijo), resize máx. 1024px, calidad 85 y **eliminación total de EXIF** (incluida la GPS).
- `app/api/owner.py` con dependencia `get_current_owner` (identidad GLOBAL vía `owner_pet_links`, **no bloqueada por suscripción** — principio 8):
  - `GET /owner/pets` — mascotas del dueño con clínica y flag `read_only`.
  - `GET /owner/pets/{id}` — detalle solo-lectura: peso, consultas (con items y `summary_pdf_url`), citas próximas.
  - `PUT /owner/pets/{id}/photo` — subida con procesamiento; guarda la foto anterior en `prev`.
  - `POST /owner/pets/{id}/photo/revert` — restaura la foto anterior.
- `POST /pets/{id}/invitations` (admin/vet): genera el token y el `activation_url` — cierra el flujo iniciado en 1.2.

**Frontend:**
- `OwnerPortal` (`/portal`, rol owner): lista de mascotas del dueño con clínica y badge "Solo lectura".
- `OwnerPetDetail` (`/portal/pets/:id`): cartilla con foto editable (subir/restaurar), historial de consultas con PDFs descargables, próximas citas; mensaje si la clínica está suspendida (solo lectura, no se bloquea).
- `InviteOwnerDialog` en la ficha clínica (`PetDetail`): captura teléfono/correo → genera el enlace de activación y permite copiarlo.
- Rutas `/portal` con `ProtectedRoute roles={['owner']}`.

### Decisiones técnicas y por qué
- **Foto de la Cartilla como columna nueva en `pets`** (principio 5): el esquema solo tenía `clinical_photo_url`; se agregó campo distinto + `_prev_url` para revertir (sección 8).
- **Pillow para todo el procesamiento:** formato único JPEG, aspect ratio fijo (cuadrado), compresión a 1024px, y `exif=b""` al guardar limpia la ubicación GPS.
- **`get_current_owner` global:** el dueño accede a todas sus mascotas sin importar la clínica; si la clínica está suspendida, `read_only=True` y la UI **muestra** los datos (no bloquea). El staff no puede tocar `/owner` (403).
- **Invitación completa:** la clínica genera el token al tener el contacto (sección 3.7, "invitación por token, nunca auto-registro"); al activar, el `owner` se reutiliza por email/teléfono (regla global, ya probado en 1.2).
- **"Vacunas" = historial de consultas/items** (el esquema no tiene tabla de vacunas; se cubren como items + PDFs de resumen).

### Verificado
- Invitación → token (43 chars) + `activation_url`; activación crea owner; login owner ✓
- `GET /owner/pets` y detalle: 2 consultas con 2 PDFs ✓
- Foto con EXIF subida → servida como **JPEG 1024×1024 SIN EXIF** ✓
- Revert: 2ª foto → revert → restaura la 1ª ✓
- Staff → `/owner/*` → **403** ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- El envío del link por WhatsApp/email queda pendiente (Motor de Automatización, Fase 2/3); en dev la clínica copia el enlace.
- `read_only` se probó para clínica activa (False); el flag para suspendida se deriva de `subscription_status` (lógica trivial en `_pet_cartilla`).

---

## Subfase 1.8 — Panel Super-Admin ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Modelo `ClinicSubscriptionEvent` (la tabla existía desde 0001).
- `POST /clinics/{id}/subscription` — cambia `subscription_status` y **registra el evento** (`activated`/`suspended`/`cancelled`, `created_by` = super-admin).
- `GET /clinics/{id}/events` — historial de eventos de suscripción.
- `GET /clinics/{id}/summary` — conteos (sucursales, staff, pacientes, citas, facturas) para el detalle.

**Frontend:**
- `SuperAdminPanel` (`/super-admin`, rol super-admin): lista de clínicas con badge de estado y **switch Activar/Suspender**, alta manual de clínica, detalle con conteos e historial de eventos.
- `ClinicFormDialog` (alta de tenant) y `ClinicDetailDialog` (conteos + eventos + toggle).
- Layout propio del super-admin (sin sidebar de clínica) con logout.
- Eliminado `SessionHome.tsx` (ya sin uso: /portal y /super-admin tienen sus paneles).

### Decisiones técnicas y por qué
- **Bitácora de suscripción:** `clinic_subscription_events` estaba vacía desde el esquema; el panel la alimenta para dar trazabilidad al dueño del producto.
- **Endpoint dedicado de suscripción** (no reutilizar PATCH): el cambio de estado es una acción del panel con registro de evento; PATCH queda para datos de contacto.
- **Panel transversal sin shell de clínica:** el super-admin opera sobre todos los tenants.
- **`read_only`/bloqueo ya probado:** al suspender una clínica, su staff recibe 403 en `get_current_clinic` (el dueño conserva solo-lectura desde 1.7).

### Verificado
- Lista de clínicas (3) + alta manual (201, luego limpiada) ✓
- Suspender Clínica Test → estado `suspended` + evento registrado; **reactivada** después de la prueba ✓
- `GET /clinics/{id}/events` y `/summary` (2 sucursales, 2 staff, 1 paciente, 3 citas, 2 facturas) ✓
- Admin de clínica → `/clinics` → **403** ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- El panel no maneja cobros/pagos (solo el estado y su bitácora); los pagos podrían alimentar `payment_received` en el futuro.

---

## Subfase 1.9 — Cierre del MVP (Perfil, Transferencia, Plantillas) ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- `GET /users/me` y `PATCH /users/me` — perfil propio del staff (nombre, teléfono, **cambio de contraseña con verificación de la actual**).
- `GET /pets/{id}/owner-links` — dueños vinculados a la mascota (activos/revocados).
- `POST /pets/{id}/owner-transfer` — transferencia: reutiliza `owner` por phone/email (regla global) o crea uno nuevo; revoca links activos; crea el nuevo link; **genera invitación** para el nuevo dueño.
- Modelo `ConsultationTemplate` (ya no registro Core) + CRUD `/templates` (admin/veterinario) con `fields_json` tipado (`TemplateField`).
- `template_id` agregado a `ConsultationCreate` y `ConsultationRead`.

**Frontend:**
- `Profile` (`/profile`, todo staff): editar nombre/teléfono y cambiar contraseña. Enlace "Mi perfil" en el sidebar.
- `TransferOwnerDialog` en `PetDetail` ("Transferir dueño"): muestra dueños actuales, transfiere y copia el link de invitación.
- `Templates` (`/templates`, admin/vet): editor de plantillas con campos dinámicos (clave, etiqueta, tipo, opciones, obligatorio).
- `NewConsultation`: **selector de plantilla** que rellena el motivo con la guía de campos y adjunta `template_id`.
- Nav con roles por ítem (Plantillas admin/vet; Servicios/Facturación/Configuración admin).

### Decisiones técnicas y por qué
- **Plantillas adelantadas de Fase 2 (decisión del usuario):** se construyeron en 1.9 como pedía el documento (confirmado). El `fields_json` se modela con un schema tipado (`TemplateField`), y la consulta referencia `template_id`.
- **Verificación de contraseña actual** para el cambio de perfil (el reset por email sigue existiendo para "la olvidé").
- **Transferencia sin tocar el expediente:** solo se revocan/crean `owner_pet_links`; mascota, consultas y pesos quedan intactos.
- **Bug detectado y corregido:** `/users/me` estaba registrado después de `/users/{user_id}`, que lo capturaba (error UUID "me"). Se reordenó. También `TemplateRead.fields` mapea `fields_json` con `validation_alias`.

### Verificado
- Perfil: GET/PATCH OK; password incorrecta rechazada; nombre actualizado ✓
- Transferencia: 3 links → nuevo dueño activo + 2 revocados + invitación ✓
- Plantillas: CRUD + consulta con `template_id` ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- ⚠️ Estado de los datos de prueba: Firulais ahora pertenece a `nuevodueno@test.com` (transferencia de prueba); el admin se llama "Dr. Test Actualizado".
- Con esta subfase se cierra la **FASE 1 (MVP)**. Queda la Fase 2 (secundarias): plantillas ya adelantadas, alertas clínicas, inventario avanzado, agenda avanzada, CRM, reportes financieros, notificaciones, auditoría.

---

## Subfase 2.1 — Alertas clínicas visuales (Plantillas ya adelantadas en 1.9) ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Modelo `ClinicalAlert` (la tabla existía desde 0001).
- Endpoints en `pets.py`: `GET /pets/{id}/alerts`, `POST /pets/{id}/alerts`, `PATCH /pets/{id}/alerts/{alert_id}`, `DELETE /pets/{id}/alerts/{alert_id}` (admin/veterinario).
- `PetRead.alert_count` en el listado de mascotas (una consulta agregada).

**Frontend:**
- `PetDetail`: sección **"Alertas clínicas"** con badges visuales (tipo + descripción), alta inline (tipo select + descripción) y resolución (X).
- Lista de `Pets`: badge "Alerta ×N" si hay alertas (o `clinical_alert_text`).

### Decisiones técnicas y por qué
- **Aislamiento vía el paciente:** `clinical_alerts` no tiene `clinic_id` en el esquema; se resuelve el `pet` dentro de la clínica del staff antes de tocar las alertas (404 si no pertenece).
- **"Resolver" = eliminar la fila:** el esquema no tiene estado activa/inactiva; la alerta existe mientras está en la tabla.
- **Tipos libres en BD**, con sugerencias en la UI (Alergia, Enfermedad crónica, Comportamiento, Medidas especiales, Otra).
- Las plantillas ya estaban listas desde 1.9 (decisión del usuario), así que 2.1 solo aportó las alertas.

### Verificado
- CRUD completo de alertas (crear 2, listar, editar, eliminar 204) ✓
- Aislamiento: staff de clínica B → 404 sobre alertas de clínica A ✓
- `alert_count` en la lista de mascotas (Firulais = 1) ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Las alertas clínicas podrían disparar notificaciones internas (2.7) o avisos al abrir una consulta; se puede conectar después.

---

## Subfase 2.2 — Inventario avanzado (FIFO, kits, predicción, órdenes de compra) ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Migración `0006`: `price` en `inventory_kits` (decisión: kit con precio propio).
- Modelos `InventoryKit`, `InventoryKitItem`, `PurchaseOrder`, `PurchaseOrderItem`.
- **FIFO por caducidad:** `allocate_fifo()` en `inventory.py` consume primero los lotes que vencen antes; se aplica al facturar productos (movimientos de venta por lote y descuento de `lot.quantity`).
- **Predicción de agotamiento:** `days_remaining` en el inventario = stock ÷ consumo diario (ventas de los últimos 30 días).
- CRUD `/kits` (admin/veterinario) con nombres de productos.
- CRUD `/purchase-orders` (admin): borrador → enviada → recibida; al **recibir**, crea los movimientos de entrada de stock automáticamente. Una orden recibida no se modifica; solo se eliminan borradores.

**Frontend:**
- Inventario: columna **Predicción** (badge si quedan <7 días).
- `Kits` (`/kits`, admin/vet): CRUD con componentes y precio.
- `PurchaseOrders` (`/purchase-orders`, admin): crear orden, cambiar estado (Enviar/Recibir/Cancelar).
- Facturación: optgroup **Kits** en el selector de conceptos (el kit se factura como línea con su precio).

### Decisiones técnicas y por qué
- **Kit con precio propio (aprobado):** el esquema no tiene precios de productos ni de kits; se agregó `price` al kit y se factura como una línea de bundle. El "descuento múltiple" queda implícito en el precio del conjunto.
- **FIFO real al facturar:** no solo visual; el movimiento de venta referencia el lote vencido primero. `lot.quantity` y el libro de movimientos se mantienen consistentes.
- **Recibir PO → movimientos `purchase`** (sin lote): el esquema de PO no trae lotes/caducidades; el FIFO aplica a los lotes que existan.
- **Predicción simple** (media de 30 días) sin modelos de serie temporal; suficiente para el MVP.

### Verificado
- FIFO: producto con L-2026 (vence antes, 5) y L-2027 (10); venta de 7 → consume los 5 del L-2026 y 2 del L-2027 (quedan 0 y 8) ✓
- `days_remaining`: 34.3 días (8 ÷ 7/30) ✓; tras recibir PO (28) → 120 ✓
- Kit creado con precio y componentes ✓
- PO: crear (draft) → recibir → stock +20 ✓
- Inventario/kits/PO vía proxy: 200 ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Datos de prueba: kit "Kit vacunación" (899), producto "Analgésico" con 2 lotes, 2 órdenes de compra.
- Quedan 2 "Amoxicilina 250mg" en distintas sucursales (ruido de pruebas anterior).

---

## Subfase 2.3 — Agenda avanzada (Lista de espera + Confirmación escalonada 48h/24h/2h) ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Modelo `AppointmentWaitlist` + CRUD `/waitlist` (staff): alta, listar (filtros), cambiar estado (waiting/offered/fulfilled/expired), eliminar.
- Modelo `OutboundNotification` (tabla existente).
- **Motor de recordatorios escalonados** (`automation.py`):
  - `GET /automation/appointments/{id}/reminder-schedule` — ventanas 48h/24h/2h con estado.
  - `POST /automation/reminders/run` — procesa citas próximas (≤48h), calcula etapas vencidas, respeta el **opt-in** (`owner_preferences.accepts_reminders`) y registra en `outbound_notifications` (whatsapp, status 'sent' como stub) **sin duplicados**.
  - `GET /automation/reminders/pending` — citas próximas con su estado de consentimiento.

**Frontend:**
- `Waitlist` (`/waitlist`, staff): tabla con estado, alta, ofrecer hueco, cumplida/expirar.
- Detalle de cita: sección **"Recordatorios escalonados"** (48h/24h/2h con su estado + badge si el dueño no tiene opt-in).
- `Automation` (`/automation`, admin): pendientes con consentimiento y botón **"Ejecutar recordatorios ahora"**.

### Decisiones técnicas y por qué
- **Envío WhatsApp como stub:** sin proveedor configurado, el motor deja todo listo (etapa, consentimiento, registro) y marca la notificación como 'sent'. El envío real se conecta cuando exista credencial de WhatsApp (Motor de Automatización).
- **Deduplicación por template:** el template codifica `rem:<appointment_id>:<stage>` para saber si ya se envió, sin columnas extra en el esquema.
- **Consentimiento obligatorio (principio 10):** sin `accepts_reminders`, la etapa se salta y cuenta en `skipped_no_consent`. Nunca por defecto.
- **Nota de zona horaria:** el servidor local es UTC-6; `datetime.now()` (naive local) vs `datetime.now(UTC)` difieren 6h. Las citas creadas vía API usan ISO correcto; los seeds de prueba con `datetime.now()+Xh` quedaban en el pasado por esta mezcla. Los endpoints usan siempre UTC aware.

### Verificado
- Waitlist: alta + listar + ofrecer hueco ✓
- Motor con cita a ~18h: cronograma 48h/24h `pending_due`, 2h `pending`; tras run → 48h/24h **sent**, 2h pendiente; re-ejecución → **0** (dedupe) ✓
- Consentimiento: dueño con opt-in → procesa; sin opt-in → `skipped_no_consent` ✓
- Pendientes: lista con estado de consentimiento ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- La UI de preferencias del dueño (opt-in) se construye en 2.4 (CRM); para probar se sembró `owner_preferences.accepts_reminders`.
- `pending` muestra `next_stage: null` cuando ninguna etapa está vencida aún; el detalle completo está en el cronograma.

---

## Subfase 2.4 — CRM básico + Encuestas + Comparador de fotos de evolución ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- **Preferencias del dueño (CRM, opt-in principio 10):** `GET/PUT /owner/preferences` — `preferred_channel` y `accepts_reminders` con `accepts_reminders_at` (timestamp al activar). Completa el flujo de 2.3.
- **Encuestas post-consulta** (`consultation_surveys`):
  - `POST /owner/consultations/{id}/survey` — el dueño califica (1-5 + comentarios) una consulta de su mascota (valida el vínculo por `owner_pet_links`); actualiza si ya existía.
  - `GET /owner/consultations/{id}/survey` y `GET /consultations/{id}/survey` (staff).
  - El detalle del dueño (`GET /owner/pets/{id}`) ahora incluye `survey` por consulta.
- **Fotos de evolución:** `GET /pets/{id}/photo-evolution` — fotos de `consultation_attachments` en orden cronológico con fecha/motivo.

**Frontend:**
- Portal del dueño: tarjeta **"Preferencias de contacto"** (toggle opt-in + canal) y **encuesta con estrellas** en cada consulta del historial (interactiva si no hay, visual si ya calificó).
- Ficha clínica: pestaña **"Fotos de evolución"** con **comparador before/after** (slider arrastrable entre dos consultas) — componente `PhotoComparison` con pointer events, sin librería extra.

### Decisiones técnicas y por qué
- **Opt-in completo:** el dueño activa/desactiva; `accepts_reminders_at` registra el momento. El motor de 2.3 lo respeta (nunca por defecto).
- **Encuesta solo del dueño** sobre sus propias mascotas; el staff solo lee.
- **Comparador before/after a medida** (clip-path + divisor arrastrable) sobre el design system.
- El detalle del dueño incluye la encuesta para no hacer N llamadas desde el frontend.

### Verificado
- Preferencias: GET + PUT con opt-in y timestamp ✓
- Encuesta: dueño califica 5 estrellas; staff la lee; detalle del dueño la incluye (1 de 4 consultas) ✓
- Fotos de evolución: 3 fotos en orden cronológico con motivo ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Datos: el dueño activo de Firulais ahora es `nuevodueno@test.com` / `dueno123456`.
- El comparador compara contra la última foto; se puede ampliar a elegir ambas fechas.

---

## Subfase 2.5 — Portal del dueño ampliado (citas y facturas) ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- `GET /owner/appointments` — próximas citas de TODAS las mascotas del dueño (vía `owner_pet_links`), con clínica, mascota y estado.
- `GET /owner/invoices` — facturas de las mascotas del dueño (pet, clínica, sucursal, total, estado, fecha; excluye canceladas).
- `GET /owner/invoices/{id}/receipt` — **recibo PDF** validando que la factura pertenezca a una mascota vinculada. Se extrajo `receipt_response()` en `invoices.py` para reutilizarlo entre admin y dueño.

**Frontend:**
- `OwnerPortal`: sección **"Próximas citas"** (todas las mascotas) y enlace **"Mis facturas"**.
- `OwnerInvoices` (`/portal/invoices`, rol owner): listado con total/estado y **descarga del recibo PDF** (fetch con token → blob).

### Decisiones técnicas y por qué
- **Global por identidad del dueño:** citas y facturas se agregan a través de `owner_pet_links`; si una clínica está suspendida, siguen visibles (solo lectura, principio 8).
- **El dueño solo accede a sus facturas:** el endpoint de recibo valida el vínculo antes de generar el PDF (404 si no le pertenece).
- **Recibo compartido:** `receipt_response()` en `invoices.py` evita duplicar la lógica del PDF entre admin y dueño.
- La facturación admin (`/invoices`) sigue siendo solo admin; la del dueño es solo lectura.

### Verificado
- Dueño: 1 cita próxima, 3 facturas (560/645/1151), recibo PDF HTTP 200 ✓
- Todo vía proxy (frontend) ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Las citas y facturas del dueño se muestran por mascota/clínica; el detalle per-mascota ya estaba en 1.7.

---

## Revert — Preferencias/CRM del dueño (decisión del producto)

**Fecha:** 2026-08-05

### Contexto
El usuario tenía la duda de si el dueño debía tener "perfil". Se verificó el documento:
- El acceso es **solo por token de invitación** (nunca auto-registro, principio 7).
- El documento SÍ contempla login del owner ("un solo login", principio 2; `owners.password_hash`; rol `owner`; "Activar cuenta con token").

Resuelta la confusión, el usuario decidió **quitar la pantalla de preferencias/CRM del dueño** (construida en 2.4) y **diferir un acceso por token directo sin login** a la lista TODO.

### Qué se deshizo
- **Backend:** `GET /owner/preferences` y `PUT /owner/preferences` eliminados de `owner.py`. Schemas `OwnerPreferencesRead`/`OwnerPreferencesUpdate` eliminados de `schemas/crm.py` y exports.
- **Frontend:** tarjeta "Preferencias de contacto" y su estado/lógica eliminadas de `OwnerPortal.tsx`.

### Qué se conserva
- Login del owner, Cartilla, próximas citas, facturas/recibos, encuestas, comparador de fotos, flujo de invitación por token. Todo sigue funcionando (verificado: pets/citas/facturas OK; `/owner/preferences` → 404).
- La tabla `owner_preferences` y el motor de recordatorios (2.3) se mantienen: sin UI del dueño, el opt-in queda en `false` por defecto (cumple el principio 10: nunca enviar sin consentimiento). El consentimiento deberá gestionarse por otro medio (clínica/seed) si se activan recordatorios.

### Nuevo pendiente
- Creado `TODO.md` con el ítem: **Acceso directo por token (sin login)** — el enlace de invitación que lleve directo a la cartilla sin crear cuenta/sesión.

---

## Ajuste — Quitar la opción "Dueño" de la pantalla de login

**Fecha:** 2026-08-05

Se eliminó la pestaña **"Dueño"** de `Login.tsx` (quedan solo Clínica y Super Admin) y la lógica asociada (`ROLE_TARGETS.owner`, labels "Correo o teléfono"). Consistente con la decisión del producto de diferir el acceso del dueño al token directo (ver TODO.md).

Se conserva en el backend: `POST /auth/login/owner`, el flujo de activación por token y el portal del dueño (el dueño se autentica al activar el token; sin él no hay pantalla de login para ese rol).

---

## Subfase 2.6 — Reportes operativos + Dashboard financiero ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend (`reports.py`):**
- `GET /reports/operational?from=&to=&branch_id=` — **todo el staff** (sin dinero): citas total y por estado, consultas total y por veterinario, pacientes atendidos, top productos usados en consultas, cancelaciones/no-show.
- `GET /reports/financial?from=&to=&branch_id=` — **solo admin**: ingresos totales (facturas `paid`), ingresos por día (serie), facturas por estado, pendientes por cobrar, ticket promedio, top servicios por ingreso.
- Rango de fechas default = últimos 30 días.

**Frontend:**
- `Reports` (`/reports`, todo staff): KPIs + gráficas (citas por estado, consultas por vet) + top productos, con selector de fechas y enlace al financiero (si admin).
- `FinancialDashboard` (`/reports/financial`, solo admin): KPIs de ingresos, gráfica de línea (ingresos por día), barras (top servicios), facturas por estado.
- Nav: **Reportes** (staff) y **Financiero** (admin).

### Decisiones técnicas y por qué
- **Permisos por contenido (regla 3.9):** el reporte operativo NO expone montos (vet/recepción pueden verlo); el financiero con montos es exclusivo del admin. Backend lo impone (`get_current_clinic` vs `require_clinic_roles("admin")`) y la UI además oculta el enlace.
- **Cálculo de ingresos en servidor** sobre facturas `paid` (nunca se confía en el cliente).
- **Gráficas con recharts** y colores `chart-*` del design system.

### Verificado
- Operativo: 7 citas (scheduled), 4 consultas (1 vet), 1 paciente ✓
- Financiero: ingresos 2356.00, ticket 785.33, 3 paid, top servicios ✓
- Recepción: operativo 200, financiero **403** ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- `top_productos` queda vacío si las consultas no referencian productos con `product_id` (los items libres no se agregan); se puede ampliar a contar descripciones.

---

## Subfase 2.7 — Centro de notificaciones internas + Bitácora/auditoría ✅

**Fecha:** 2026-08-05

### Qué se hizo
**Backend:**
- Modelos `InternalNotification` y `AuditLog` (tablas existentes).
- Helpers transversales en `app/core/events.py`: `notify_user`, `notify_roles` y `record_audit`.
- `notifications.py`: `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/{id}/read`, `POST /notifications/read-all`.
- `audit.py`: `GET /audit-log` con filtros (entidad, acción, rango) — por clínica.
- **Hooks de notificación:** cancelación/no-show de cita → vet asignado; alerta clínica creada → vets+admins; stock < 5 tras movimiento → admins.
- **Auditoría registrada en:** alta/edición de mascota, foto clínica, foto de la Cartilla (actor `owner`) + revert, alertas crear/resolver, cambio de estado de cita, transferencia de dueño, cancelación de factura, desactivación de usuario, eliminación de consulta.

**Frontend:**
- `NotificationBell` en el header del panel clínico: campana con contador de no leídas, dropdown con notificaciones, marcar leída/todas, polling 30s.
- `Audit` (`/audit`, staff): tabla de bitácora con filtros por acción/entidad y badges con etiquetas legibles.

### Decisiones técnicas y por qué
- **Notificaciones en eventos clave** (cancelaciones, alertas, stock bajo) — las de mayor valor; ampliables después.
- **Bitácora central con `record_audit`** — actores `user`/`owner`/`system`; aislada por `clinic_id`.
- **Bug latente corregido (de 2.2):** `StockEntryCreate` rechazaba cantidades negativas (`gt=0`), pero el frontend envía negativos para salidas. Se cambió a `ne=0`; el aviso de stock bajo requería ver el movimiento antes de evaluar (`db.flush()` antes de `_maybe_notify_low_stock`).

### Verificado
- Cancelar cita → notificación `appointment_cancelled` al vet; contador 1; marcar leída → 0 ✓
- Salida de stock 6→4 → notificación `low_stock` a admins ✓
- Bitácora registra los eventos (acción, entidad, actor, metadata) ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- La bitácora y las notificaciones quedan listas para alimentarse de más eventos conforme crezca el sistema.

---

## Subfase 2.8 — Campos base de perfiles de staff y clínica ✅

**Fecha:** 2026-08-06

### Qué se hizo
Prepara el esquema para las ideas diferidas de `IDEAS.txt` (login con foto de usuario, setup wizard tipo Ubuntu con organigrama). El "super usuario" de la clínica es el rol `admin` actual (sin cambios en el modelo de roles).

**Migraciones:**
- `0007_base_profiles`: `users` + `photo_url`, `professional_title`, `cedula`, `job_title`, `description`, `specialty`, `reports_to` (self-FK → organigrama), `last_login_at`, `is_visible_on_login`. `clinics` + `logo_url`, `timezone` (UTC), `address`, `rfc`, `fiscal_name`, `currency` (MXN), `setup_completed` (default true). `super_admins` + `photo_url`.
- `0008_super_admin_last_login`: `super_admins.last_login_at` (separada porque 0007 ya había corrido).

**Backend:**
- `/auth/me` ahora devuelve `full_name` + `photo_url` (staff y super-admin).
- Login de staff y super-admin actualiza `last_login_at`.
- `POST /users/{id}/photo` — foto de perfil del staff (admin o el propio usuario), procesada igual que la Cartilla: JPEG cuadrado, sin EXIF, máx. 5 MB. Auditoría `staff_photo_updated`.
- `GET|PATCH /clinics/me` — perfil de mi clínica (staff lee, admin edita). `POST /clinics/me/logo` — logo, auditoría `clinic_logo_updated`.
- `reports_to` validado a la misma clínica en create/update.

**Frontend:**
- `Profile`: foto de perfil (subir/cambiar), título, cédula, cargo, especialidad, descripción.
- `Settings`: tab "Clínica" con logo, nombre, contacto, dirección, RFC, razón social, timezone y moneda. `UserFormDialog` con los campos profesionales nuevos.
- `AppLayout`: avatar con foto real en el sidebar (vía `/auth/me`).
- `Audit`: etiquetas para `staff_photo_updated` y `clinic_logo_updated`.

### Verificado
- Migraciones 0007+0008 aplicadas; retrofit seguro (columnas nullable/defaults) ✓
- Upload de foto de staff → sirve por `/media` 200 ✓
- `PATCH /clinics/me` (rfc/timezone) y `PATCH /users/{id}` con campos nuevos ✓
- `last_login_at` se actualiza al iniciar sesión (staff y super-admin) ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Queda en `TODO.md` la idea del login con foto (usar `is_visible_on_login`, `photo_url` y el `reports_to`).
- `setup_completed` queda listo para el wizard de la idea 2; hoy default true para no bloquear tenants existentes.

---

## Subfase 2.9 — Permisos por componente (idea 2: activar/desactivar módulos por usuario) ✅

**Fecha:** 2026-08-06

### Qué se hizo
El admin de la clínica ahora concede/deniega acceso a módulos del panel por usuario, con acceso por defecto según el rol.

**Modelo:**
- Migración `0009_user_component_permissions`: tabla con `(user_id, component, allowed)`, UNIQUE `(user_id, component)`. Solo guarda **overrides**: sin fila = default del rol.
- `app/core/permissions.py`: catálogo de 15 componentes, `ROLE_DEFAULT_COMPONENTS` (espejo del comportamiento previo) y `effective_components` (default + overrides).
- `deps.require_component(*slugs)`: 403 si el staff no tiene (al menos) uno de los componentes. Valida suscripción vía `get_current_clinic`.

**Enforcement backend (el componente ES la puerta del módulo):**
- Router-level en: pets, consultations (flujo paciente), agenda (appointments+schedule_blocks), waitlist, dashboard, inventory, kits, purchase_orders, invoices, services, templates, automation, audit.
- Reports por endpoint: `reports` (operativo, todo staff) y `financial` (admin + componente).
- Mutaciones de settings (users/branches/clinic logo) → `require_component("settings")`.
- Se **quitaron restricciones duras de rol redundantes** en invoices/purchase_orders/services: el componente con su default por rol ya las cubre, y así el grant del admin sí surte efecto (ej. darle Facturación a recepción).
- `financial` conserva `require_clinic_roles("admin")` + componente (regla sección 3.9).

**Endpoints:**
- `GET /users/me/components` → componentes efectivos del autenticado (para el nav/guard).
- `GET /users/{id}/components` → catálogo + defaults + overrides + efectivos.
- `PUT /users/{id}/components` → **sync completo**: los overrides recibidos reemplazan a los existentes; componente ausente = vuelve al default (se borra la fila).

**Frontend:**
- `PermissionsProvider` (`lib/permissions.tsx`) carga los componentes efectivos y expone `hasComponent`.
- `AppLayout`: `NAV_ITEMS` mapea cada ruta a un componente y filtra por `hasComponent` (ya no usa `roles`).
- `ProtectedRoute`: prop `component` → pantalla de acceso restringido si no aplica.
- `UserFormDialog`: sección "Acceso a componentes" con tri-estado (Según rol / Permitir / Denegar); al guardar envía los overrides (grant/deny) y el resto se limpia con el sync.

### Decisiones técnicas y por qué
- **Componente = puerta del módulo**, rol = default: permite grants y revokes por usuario sin romper el modelo existente (el default replica exactamente el comportamiento anterior).
- **Sync completo en PUT**: evita filas huérfanas; el tri-estado "Según rol" equivale a no enviar el componente.
- **Financial sigue admin**: el documento (3.9) exige que las pantallas con montos sean admin.

### Verificado
- Admin: 15 componentes; recepción: 7 por default ✓
- Recepción: /pets y /reports/operational → 200; /invoices, /services, /automation, /reports/financial → 403 ✓
- Grant a recepción (invoices+kits) → 200; deny (audit) → 403; revert → restaurado ✓
- Financial: admin 200, recepción 403 ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- El `NotificationBell` y el perfil quedan siempre accesibles para el staff (no son componentes).
- El organigrama (reports_to) se configura desde el wizard; la vista visual queda como idea futura.

---

## Subfase 2.10 — Setup wizard (idea 2: configuración inicial del tenant) ✅

**Fecha:** 2026-08-06

### Qué se hizo
Pantalla de configuración inicial tipo Ubuntu, que aparece **solo la primera vez** que entra el admin de una clínica nueva (trigger: `clinics.setup_completed=false`).

**Trigger y alta:**
- Toda clínica nueva nace con `setup_completed=false`.
- `POST /clinics` (super-admin) acepta `first_admin` (nombre, email, password, título, cédula): crea el tenant + la cuenta admin inicial en la misma transacción.
- `/auth/me` ahora expone `setup_completed` para el staff.
- `ProtectedRoute`: si el rol es `admin` y `setup_completed=false`, redirige a `/setup` (excepto en `/setup`).

**Wizard (`SetupWizard`, 7 pasos):**
1. **Clínica**: nombre, logo, contacto, dirección.
2. **Super usuario**: título, cédula, cargo, especialidad, teléfono, foto.
3. **Sucursales**: define cuántas y sus nombres (nuevo requisito del usuario).
4. **Equipo**: alta de dependientes (vet/recepción/admin) con sucursal y contraseña.
5. **Organigrama**: quién reporta a quién (`reports_to`).
6. **Accesos**: activa/desactiva componentes por usuario (solo envía las diferencias al default del rol).
7. **Listo**: `setup_completed=true` → entra al panel.

### Decisiones técnicas y por qué
- **El componente es el guard**: `ProtectedRoute` fuerza `/setup` con `me.setup_completed===false`, sin bloquear rutas públicas.
- **`SetupProvider`** (`lib/setup.tsx`) carga `/auth/me` una vez y expone `refresh()` para actualizarlo al terminar.
- **first_admin dentro de `POST /clinics`**: evita clínicas sin nadie que pueda iniciar sesión; el alta queda atómica.
- El paso de accesos usa el mismo endpoint `PUT /users/{id}/components` (sync completo) que la 2.9.

### Verificado
- Crear clínica con `first_admin` → `setup_completed=false` ✓
- Login del admin nuevo → `/auth/me` con `setup_completed=false` ✓
- Pasos 1-7 simulados por API: clínica, perfil, sucursales (Norte/Sur), equipo, organigrama, grant de componentes, `setup_completed=true` ✓
- Luego `/auth/me` → `setup_completed=true` (el wizard ya no aparece) ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- El wizard está pensado para el primer super-usuario; los demás admins también lo verán hasta completarlo (caso borde aceptable).

---

## Subfase 2.11 — Login con selección de usuario con foto (idea 1 de IDEAS.txt) ✅

**Fecha:** 2026-08-06

### Qué se hizo
La pantalla de inicio ahora muestra la rejilla de perfiles con foto para seleccionar quién inicia sesión, en lugar del formulario email/contraseña como paso principal.

**Backend:**
- `GET /auth/login-candidates` (público): staff con `is_visible_on_login=true` agrupados por clínica (solo clínicas activas/trial) + super-admins. No expone emails de staff (se piden en el paso de contraseña).
- `POST /auth/login/user` (público): login por `user_id` + contraseña. Evita la ambigüedad de emails repetidos entre clínicas y actualiza `last_login_at`.

**Frontend:**
- `Login` reescrito: rejilla de tarjetas con foto (avatar por inicial si no hay foto), agrupadas por clínica; clic → paso de contraseña → login. El super-admin se muestra en su propia sección (usa su email, que sí se expone).
- `UserFormDialog`: ahora permite **subir foto** al crear/editar un usuario y un checkbox **"Visible en la pantalla de inicio"** (`is_visible_on_login`). Completa el requisito de "agregar usuarios con foto, nombre, cargo, cédula, descripción".

### Decisiones técnicas y por qué
- **Login por id en lugar de email**: los emails son únicos por clínica (no globales); seleccionar una tarjeta solo con la foto + contraseña es más robusto y evita colisiones.
- **Los candidatos NO incluyen el email del staff**: la rejilla es de cara pública; el email solo se usa en el backend al autenticar por id. Solo los super-admins exponen email (porque su login es por email).
- Se reutilizan los campos de la 2.8 (`photo_url`, `is_visible_on_login`); el endpoint `/users/{id}/photo` ya existía.

### Verificado
- `login-candidates` agrupa por clínica y filtra por visibilidad/suscripción ✓
- Login por id: ok con contraseña correcta, 401 con incorrecta ✓
- `is_visible_on_login=false` quita al usuario de la rejilla; true lo regresa ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- La idea 1 queda cerrada. El acceso del dueño por token sigue en `TODO.md`.
- La pantalla con foto puede crecer después (multi-perfil de clínica, búsqueda), pero el core está listo.

---

## Subfase 2.12 — Modelo de un solo admin (corrección de rol) + wizard ampliado ✅

**Fecha:** 2026-08-06

### Qué se hizo
Corrección del modelo conceptual: el usuario aclaró que **el admin de la clínica es el super usuario** (no existe un "Super Admin de plataforma" en la UX). Todo se gestiona desde la clínica.

**Modelo de un solo admin:**
- `POST /clinics/register` (público): crea la clínica + su primer super-usuario (admin) y devuelve token → el admin arranca directo el wizard. Ya no depende de un super-admin de plataforma.
- `/auth/login-candidates` ya **no** expone super-admins (solo staff por clínica).
- Se eliminaron la ruta `/super-admin` y el `SuperAdminPanel` + diálogos de plataforma (`pages/superadmin`, `components/superadmin`).
- El rol `super-admin` queda en el backend por compatibilidad, pero no tiene entrada por UI.

**Wizard ampliado (solicitud del usuario):**
- **Dependientes por sucursal**: el paso Equipo ahora agrupa por sucursal (agregar dependientes a cada sucursal concreta).
- **Puestos**: lista predefinida de puestos (`PUESTOS`: Director, Encargado de sucursal, Veterinario, Cirujano, Dermatólogo, Recepción, Auxiliar, Administrativo) para super-usuario y dependientes (→ `job_title`).
- **Privilegios**: el paso Accesos ahora es un toggle **activar/desactivar** (botón SÍ/NO) por pantalla, en lugar de checkbox.
- Organigrama renombrado a "Organigrama y encargados" (muestra puesto + jefe).

### Decisiones técnicas y por qué
- **Registro público con token**: sin nivel de plataforma, la primera interacción es "crear mi clínica" desde el login → wizard. El alta queda atómica (clínica + admin + sesión).
- **Se conservan `super_admins` y `/auth/login/super-admin` en backend** por compatibilidad/diagnóstico, pero sin acceso desde la UI (decisión reversible).
- Los datos de prueba (Test/Beta/Suspendida y las clínicas creadas durante pruebas) se eliminaron; el sistema queda vacío para que el usuario cree su clínica.

### Verificado
- `POST /clinics/register` crea clínica + admin y devuelve token ✓
- `login-candidates` solo devuelve `clinics` (sin super-admins) ✓
- Wizard por API: sucursales, dependiente con puesto (`job_title`), permisos ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- El backend conserva el rol `super-admin` (login + seed) sin UI; se puede eliminar después si se confirma que no hará falta.
- Queda en `TODO.md` el acceso del dueño por token.

---

## Subfase 2.13 — Dueño al registrar mascota + diccionario dinámico de razas ✅

**Fecha:** 2026-08-06

### Qué se hizo
**1. Dueño en el alta de mascota (Pacientes → Nueva mascota):**
- Migración `0010_owner_contact`: `owners` + `full_name`, `alt_contact_name`, `alt_phone`.
- `PetCreate.owner`: `{full_name, phone, email, alt_contact_name, alt_phone}`.
- `create_pet` reutiliza o crea el owner (regla de identidad global: nunca duplica por email/teléfono, mismo patrón que la transferencia) y crea el vínculo `owner_pet_links` con `ON CONFLICT`.
- Las lecturas de mascotas (`list`, `get`, `create`) ahora incluyen `owners` con nombre y contacto alternativo (`OwnerLinkRead` ampliado).

**2. Diccionario dinámico de razas:**
- `app/data/breeds.py`: 11 especies (perro, gato, ave, conejo, reptil, roedor, pez, anfibio, hurón, caballo, otro) con sus razas/variedades basadas en catálogos públicos (AKC/FCI, CFA, ARBA, etc.) — incluye mascotas inusuales (serpientes, camaleones, axolote, erizo pigmeo, suricata…). Toda especie incluye "Mestizo".
- `GET /pets/breeds-catalog` (staff): especies + razas por especie.
- `PetFormDialog`: especie → el dropdown de raza se despliega según la especie (dinámico), con Mestizo.
- `PetDetail`: nueva tarjeta "Dueño" con nombre, teléfono, correo y contacto alternativo.

### Decisiones técnicas y por qué
- **Dueño como bloque opcional dentro del alta**: si no se captura, el flujo actual de Invitar/Transferir sigue funcionando.
- **Reutilización del owner**: se evita duplicar la identidad del dueño (principio del documento) — el mismo patrón de `transfer_owner`.
- **Catálogo estático pero "dinámico" en UI**: la lista de razas cambia según la especie seleccionada; es una sola fuente (`data/breeds.py`) reutilizable por el backend y expandible.

### Verificado
- Alta de mascota con dueño → `owners` en respuesta con nombre/teléfono/correo/alternativo ✓
- Owner reutilizado si ya existía por email ✓
- `breeds-catalog`: 11 especies, Mestizo en todas, perro 94 razas, gato 38, reptiles 26, peces 23 ✓
- Ruff + lint 0 errores + build OK ✓
- Datos de prueba eliminados.

### Notas / pendientes
- El catálogo de razas se puede ampliar/especializar después (agregar variedades a la DB si crece).
- Queda en `TODO.md` el acceso del dueño por token.

---

## Subfase 2.14 — Color y características especiales de la mascota ✅

**Fecha:** 2026-08-06

### Qué se hizo
Identificación visual del paciente: color (con segundo color opcional) y características especiales (manchado, atigrado, pío, etc.).

**Backend:**
- Migración `0012_pet_color_markings`: `pets` + `color_primary`, `color_secondary`, `markings`.
- Modelo y schemas actualizados (create/update/read).
- `app/data/breeds.py`: `COLORS_BY_SPECIES` (colores comunes por especie: perro, gato, ave, conejo, reptil, roedor, pez, anfibio, hurón, equino, otro) y `MARKINGS_BY_SPECIES` (características/patrones por especie).
- `GET /pets/breeds-catalog` ahora devuelve también `colors` y `markings` por especie.

**Frontend:**
- `PetFormDialog`: campos "Color 1", "Color 2 (opcional)" y "Características especiales" con dropdowns que dependen de la especie (el color 2 excluye el color 1).
- `Pets` (lista): columnas Color (con punto de color) y Características.
- `PetDetail`: ficha con Color y Características.

### Decisiones técnicas y por qué
- **Dos colores**: la mayoría de mascotas tienen uno o dos colores; `color_secondary` es opcional y se excluye de la lista si ya se eligió el primario.
- **Catálogos por especie**: misma fuente (`data/breeds.py`) y mismo patrón que las razas; se pueden ampliar igual que ellas.

### Verificado
- `breeds-catalog` devuelve `colors` y `markings` por especie ✓
- Alta de mascota con color 1 + color 2 + marcas → se guardan y se leen ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Queda en `TODO.md` el acceso del dueño por token.

---

## Subfase 3.2 — Consentimientos digitales firmados en tablet ✅

**Fecha:** 2026-08-06

### Qué se hizo
El staff genera un consentimiento informado (título + texto), el dueño lo **firma dibujando en la tablet**, y el sistema guarda la firma (PNG) y genera un **PDF firmado** que queda archivado en el expediente.

**Backend:**
- Migración `0013_consents`: amplía `digital_consents` (existente desde 0001) con `clinic_id`, `pet_id`, `title`, `body`. (`signature_url`/`pdf_url` ya existían con `NOT NULL`.)
- Modelo `DigitalConsent` + schemas `ConsentCreate`/`ConsentRead`.
- `services/pdf.py::build_consent_pdf`: PDF con logo/estilo VetCore, info del paciente/dueño, texto del consentimiento e **imagen de la firma**.
- `api/consents.py`:
  - `POST /consents` — recibe la firma en base64 (data URI o crudo), la guarda como PNG en `/media/consents/...` y genera el PDF. Auditoría `consent_created`.
  - `GET /consents/pets/{pet_id}` — historial de consentimientos de la mascota (por clínica).

**Frontend:**
- `SignaturePad`: canvas de firma a mano (mouse/touch, retina-ready, botón Limpiar) que expone el data URL.
- `ConsentDialog`: título + texto del consentimiento + nombre del dueño + **pad de firma** → "Firmar y generar PDF". Valida que exista firma.
- `PetDetail`: botón "Consentimiento" en el header, tab "Consentimientos" con la lista (fecha + Ver PDF) y botón "Nuevo consentimiento".

### Decisiones técnicas y por qué
- **Firma como PNG + PDF con la imagen**: queda tanto la firma original como el documento final; ambos se sirven por `/media`.
- **Base64 flexible**: acepta data URI (lo que produce el canvas) o base64 crudo.
- **`clinic_id`/`pet_id` obligatorios**: aislamiento multi-tenant y archivo en el expediente del paciente (la tabla base no los tenía).
- `owner_id`/`consultation_id` quedan opcionales (se pueden vincular después al flujo de consulta).

### Verificado
- `POST /consents` con firma PNG → firma + PDF en `/media`, ambos 200 ✓
- `GET /consents/pets/{id}` devuelve historial por clínica ✓
- PDF incluye la firma (reportlab ImageReader) ✓
- Ruff + lint 0 errores + build OK ✓

### Notas / pendientes
- Siguientes subfases de Fase 3: 3.3 Hospitalización y 3.4 Laboratorio **en hold** (decidido 2026-08-06); 3.1/3.5/3.6 en `TODO.md`.
- El consentimiento aún no se vincula automáticamente a una consulta; se puede conectar cuando se integre al flujo de Nueva consulta.

---

## Eliminación — Módulo de kits de inventario (redundante)

**Fecha:** 2026-08-06

### Contexto
El usuario consideró los kits redundantes y pidió eliminar el módulo y todas sus referencias (código, esquema, permisos, navegación y documento maestro).

### Qué se eliminó
- **Backend:** `api/kits.py`, `schemas/kit.py`, modelos `InventoryKit`/`InventoryKitItem` (de `models/inventory.py` y exports), registro del router en `main.py`, componente `kits` del catálogo y defaults de `core/permissions.py`.
- **Migración `0014_remove_kits`:** dropea las tablas `inventory_kits` e `inventory_kit_items` (aplicada; la BD no tenía datos de kits).
- **Frontend:** `pages/Kits.tsx`, `components/kits/KitFormDialog.tsx`, ruta `/kits` e import en `App.tsx`, entrada del nav en `lib/nav.ts`, icono en `AppLayout.tsx`, y el optgroup/estado/fetch de kits en `InvoiceFormDialog.tsx` (la facturación queda solo con servicios + productos + conceptos manuales).
- **Documento maestro:** definiciones de `inventory_kits`/`inventory_kit_items`, mención de kits en la 2.2 y el ítem "Inventario por kit" del checklist.

### Notas
- Los registros históricos de la subfase 2.2 se conservan como bitácora del trabajo realizado.
- La facturación por conjunto se puede reproducir como línea manual con descuento.

---

## Módulo — Planes de vacunación (programación automática de citas) ✅

**Fecha:** 2026-08-06

### Qué se hizo
El admin define planes de vacunación (nombre, compuesto activo, notas y una lista de **dosis** con su intervalo). Al **asignar un plan a una mascota** (desde el alta de mascota), el sistema genera **todas las dosis de golpe** y una **cita automática por dosis** en la agenda.

**Decisiones del usuario (2026-08-06):**
- Estructura del plan: **la define el admin** (multi-dosis / intervalo según el esquema).
- Programación: **todas las dosis de golpe** al asignar.
- Primera dosis: **desde la fecha de asignación**.
- Cita: **sucursal, veterinario (opcional) y hora se eligen al asignar**; duración 30 min por defecto.

**Backend:**
- Migración `0015_vaccination_plans`: `vaccination_plans` + `vaccination_plan_steps` (label, offset_days desde la dosis anterior, position) + `pet_vaccination_plans` (asignación: pet, plan, branch, vet?, start_date, start_time, duration) + `pet_vaccination_doses` (dosis generadas con su cita).
- `api/vaccination_plans.py`: CRUD de planes (admin) con pasos; `POST /vaccination-plans/assign` (pet_id, plan_id, branch_id, vet?, start_date, start_time) → genera la asignación + dosis + citas en una transacción (409 si el plan ya está asignado a la mascota); `GET /vaccination-plans/pets/{pet_id}` → agenda de vacunación con nombres y cita asociada.
- **Hook en `appointments.py`:** al completar una cita de vacunación, la dosis vinculada se marca `completed`.
- Permisos: componente `vaccination_plans` (admin y veterinario por defecto; mutaciones solo admin).
- Auditoría: `plan_created/updated/deleted`, `vaccination_plan_assigned`.

**Frontend:**
- Página `VaccinationPlans` (`/vaccination-plans`, sidebar con jeringa, admin) + `PlanFormDialog`: nombre, compuesto, notas, activo/inactivo y **editor de dosis** (etiqueta + "cada" días/meses/años + agregar/quitar).
- `PetFormDialog`: sección **"Agregar plan de vacunación"** (toggle) → plan, sucursal, veterinario, fecha y hora de inicio; al guardar la mascota se asigna el plan.
- `PetDetail`: nuevo tab **"Vacunación"** con las asignaciones y sus dosis (fecha, hora, estado: Programada/Completada/Omitida).

### Verificado
- Plan quintuple 0/+60d/+60d/+365d → 4 dosis y 4 citas con fechas acumuladas correctas ✓
- Hora elegida respetada (ej. 11:30 UTC) y `procedure_type` "Vacunación: {compuesto}" ✓
- Duplicado de asignación → 409 ✓
- Completar la cita → la dosis pasa a `completed` ✓
- Historial por mascota y componente en permisos del admin ✓
- Ruff + lint 0 errores + build OK ✓
- Datos de prueba eliminados.

### Notas / pendientes
- La estructura del plan es de pasos fijos (no hay recursión infinita: si se quiere un refuerzo anual recurrente, el admin agrega las dosis que quiera).
- Los intervalos se guardan en **días** (1 mes = 30, 1 año = 365) para fechas deterministas.

---

## Módulo — Productos (catálogo de venta de la veterinaria) ✅

**Fecha:** 2026-08-06

### Qué se hizo
Nuevo módulo **"Productos"** para la venta retail de la veterinaria (croquetas, premios, ropas, camas, platos, etc.). El admin registra cada producto con **nombre, categoría, precio (opcional) y foto (opcional)**, y el catálogo queda consultable en cualquier momento. Es independiente del inventario de insumos (`inventory_products`).

**Backend:**
- Migración `0016_sale_products`: tabla `sale_products` (clinic_id, name, category, price, photo_url, active, created_at) — multi-tenant.
- `models/product.py::SaleProduct`, schemas `ProductCreate/Update/Read`.
- `api/products.py`: CRUD (mutaciones solo admin) + `POST /products/{id}/photo` + `GET /products/categories` (distintas categorías usadas) + listado con filtro por categoría y `active_only`.
- `core/images.py::process_product_photo`: convierte a JPEG comprimido y sin EXIF **conservando el aspect ratio** (a diferencia de la foto de la Cartilla, que es cuadrada) — ideal para fotos de producto.
- Permisos: componente `products` (admin por defecto). Auditoría: `product_created/updated/deleted`, `product_photo_updated`.

**Frontend:**
- Página `Products` (`/products`, sidebar con bolsa de compras, admin) en **grid de tarjetas** con foto (o placeholder), nombre, badge de categoría, precio, estado e iconos editar/eliminar.
- `ProductFormDialog`: nombre, **categoría con sugerencias** (Alimento, Premios, Juguetes, Ropa, Camas, Platos y accesorios, Higiene, Farmacia, Otro — se puede escribir una propia vía datalist), precio opcional, activo/inactivo y **foto opcional** con vista previa (se sube tras crear/editar).

### Verificado
- Alta de producto → listado + `GET /products/categories` ✓
- Subida de foto PNG 200×150 → se procesa a **JPEG** (200×150, aspect ratio conservado) y sirve por `/media` 200 ✓
- DELETE del producto ✓
- Componente `products` en permisos del admin; Ruff + lint 0 errores + build OK ✓
- Datos de prueba eliminados.

### Ajuste posterior (mismo día)
- **Cantidad en existencia:** el usuario pidió un campo de stock. Migración `0017_product_stock` agrega `sale_products.stock_quantity` (Integer, default 0). Modelo/schemas/CRUD actualizados; el modal tiene "Cantidad en existencia" y las tarjetas muestran "N en existencia" o "Agotado". Verificado por API (crear con stock 12, PATCH a 4, DELETE).

### Notas / pendientes
- Es un catálogo independiente; si después se quiere vender desde Facturación, se puede integrar como fuente de conceptos (igual que servicios/insumos) y descontar stock.

---

## "Nueva consulta" como checkout (caja) ✅

**Fecha:** 2026-08-06

### Qué se hizo
El botón **"Nueva consulta"** ahora es un **checkout** que completa la consulta y genera todo: la consulta (con el vet que atendió, motivo, **peso** y fecha/hora), la **factura pagada** (servicios + productos → subtotal), el **descuento de stock** de Productos y el **PDF/recibo** para imprimir. Decisiones del usuario: es el mismo flujo de "Nueva consulta" (no un módulo aparte), genera **factura + PDF**, y **recepción puede usarlo**.

**Backend:**
- Migración `0018_checkout_fields`: `consultations.performed_at` (fecha/hora capturada en el checkout) y `invoices.send_receipt_whatsapp` (casilla del recibo por WhatsApp; la lógica de envío se implementa después).
- `POST /consultations/checkout` (admin/vet/**recepción**): valida pet/sucursal/vet/servicios/productos; en **una transacción** crea la consulta (con sus items = servicios+productos aplicados), el **peso registrado**, la **factura paid** (descuento automático de servicios, sin exponer el módulo de Facturación a recepción), descuenta stock de `sale_products` (409 si no alcanza) y genera el **PDF de resumen** y el **recibo** (guarda el flag de WhatsApp).
- `PUT /pets/{pet_id}/owner-contact` (admin/vet/recepción): la recepción **verifica/corrige** el contacto del dueño activo (nombre, teléfono, correo, alternativos). Devuelve los valores frescos tras el update.
- `CONSULTATION_MUTATORS`/checkout permiten el rol recepción.

**Frontend (`NewConsultation.tsx`, ruta `/consultas/nueva`):**
1. **A quién se consultó** (vet) + sucursal + **buscar la mascota** (con preview de dueño/teléfono para evitar confusiones).
2. **Dueño y contacto** editables (certificación) — si se cambian, se persisten vía owner-contact.
3. **Último peso de la mascota** (prellenado con `latest_weight_kg`, editable) — se registra en la consulta.
4. **Fecha y hora** + motivo.
5. **Servicios** del catálogo (se suman al subtotal con su descuento) y **Productos** (se suman y descuentan stock; opción deshabilitada si está agotado).
6. **Próxima vacunación** según el esquema (próxima dosis programada).
7. **Resumen/subtotal** + casilla **"Enviar recibo por WhatsApp"** (lógica pendiente).
8. Éxito → enlaces a **"Imprimir recibo (PDF)"** y **"Ver resumen (PDF)"**.

El botón de la ficha del paciente ahora va a `/consultas/nueva?pet=<id>` (la mascota se precarga; desde ahí también se puede buscar otra).

### Verificado
- Checkout con servicio (Cirugía $3800) + producto (Cama ×2 $350) → factura total $4500, flag WhatsApp true, stock 5→3, peso 12.5 registrado, ambos PDF 200 ✓
- `owner-contact` actualiza y devuelve los valores frescos ✓
- Ruff + lint 0 errores + build OK ✓
- Datos de prueba eliminados (factura/consulta/producto/peso/PDFs) y contacto del dueño restaurado.

### Notas / pendientes
- El recibo por WhatsApp queda como flag guardado (`send_receipt_whatsapp`); la integración con el proveedor (WhatsApp) se hace después.
- La consulta se crea con motivo + items (sin diagnóstico/tratamiento, que son del vet); el resumen PDF queda informativo y la ficha puede ampliarlo después.

---

## Eliminación — Módulo "Reportes" (operativos)

**Fecha:** 2026-08-06

### Contexto
El usuario indicó que el módulo de Reportes operativos no le sirve y pidió borrarlo **conservando el Financiero** (dashboard de movimientos/ingresos-egresos y gastos).

### Qué se eliminó
- **Backend:** endpoint `GET /reports/operational` (citas/consultas/top productos) y su helper `_branch_scope` de `api/reports.py`; imports sin uso (Appointment, Consultation, ConsultationItem, InventoryProduct, User). Componente `reports` fuera de `core/permissions.py` (catálogo y defaults de vet/recepción).
- **Frontend:** `pages/Reports.tsx`, ruta `/reports` e import en `App.tsx`, entrada del nav, icono `BarChart3` en `AppLayout`, enlace "Reportes operativos" del `FinancialDashboard` y nota obsoleta del Dashboard.
- **Documento maestro:** principio 9 (ahora refiere al módulo Financiero), subfase 2.6 y ítem "Reportes operativos" del checklist.

### Qué se conserva
- **Financiero** (`/reports/financial`, admin): dashboard con lista de movimientos (ingresos + egresos), CRUD de gastos y KPIs. El componente `financial` y el router `reports` (ahora solo financiero) siguen activos.

---

## Ajuste — Opt-in de recordatorios del dueño (preferencias de contacto)

**Fecha:** 2026-08-06

### Contexto
Tras explicar el módulo Automatización, se notó que el dueño **no tenía ningún lugar** para aceptar los recordatorios: la pantalla de preferencias (2.4) se había revertido y los endpoints `/owner/preferences` se eliminaron. Sin opt-in, el motor de recordatorios omite todo (`skipped_no_consent`).

### Qué se hizo
- **Backend:** se restauraron `GET /owner/preferences` y `PUT /owner/preferences` (admin de owner vía `get_current_owner`), usando la tabla `owner_preferences` que ya existía. Al aceptar se guarda `accepts_reminders_at = now()`. Schemas `OwnerPreferencesRead/Update` en `schemas/crm.py`.
- **Frontend:** tarjeta **"Preferencias de contacto"** en el Portal del dueño con un **toggle** para aceptar recordatorios por WhatsApp (optimista, revierte si falla; muestra la fecha de activación).

### Verificado
- GET default (whatsapp/false), PUT activar → `accepts_reminders_at` seteado, GET persiste, PUT desactivar ✓
- Owner de prueba creado y eliminado ✓
- Ruff + lint 0 errores + build OK ✓

### Notas
- El envío real de WhatsApp sigue pendiente (proveedor); el opt-in ya queda gestionable por el dueño.

---

## Documentación — Origen de los datos de la cartilla (pestañas inferiores)

**Fecha:** 2026-08-07

Referencia de dónde se recupera cada campo de la ficha de paciente
(`PetDetail.tsx`), pestaña por pestaña.

### Línea de tiempo — `GET /pets/{id}/timeline`
Mezcla dos tablas y las ordena por fecha descendente:

- **Consultas** (tabla `consultations`):
  - `type` = fijo `"consulta"`
  - `title` = `consultations.reason` (o "Consulta" si no hay)
  - `subtitle` = `"Diagnóstico: " + consultations.diagnosis`
  - `author` = `users.full_name` (por `consultations.vet_user_id`)
  - `date` = `consultations.created_at`
- **Citas** (tabla `appointments`):
  - `type` = fijo `"cita"`
  - `title` = `appointments.procedure_type`
  - `subtitle` / `author` = vacíos
  - `date` = `appointments.start_time`
  - `status` = `appointments.status` (`scheduled/confirmed/completed/cancelled/no_show`; el
    frontend lo traduce a Agendada/Confirmada/Completada/Cancelada/No asistió)

### Peso histórico — `GET /pets/{id}/weights`
De la tabla `pet_weight_records`:
- `weight_kg`, `recorded_at` (la API ordena por `recorded_at DESC`)
- El KPI (último peso + variación ▲/▼) lo calcula el frontend con los 2 registros más recientes
- Los pesos se crean desde "Nueva consulta" (checkout) o `POST /pets/{id}/weights`

### Fotos de evolución — `GET /pets/{id}/photo-evolution`
De las consultas con foto adjunta (`consultations` + `consultation_attachments`):
- `url` = la foto subida; `consultation_date` = `consultations.created_at`; `reason` = motivo

### Consentimientos — `GET /consents/pets/{id}`
De la tabla `digital_consents`: `title`, `body`, `signature_url`, `pdf_url`, `signed_at`

### Vacunación — `GET /vaccination-plans/pets/{id}`
De las asignaciones (`pet_vaccination_plans`) enriquecidas:
- `plan_name`, `compound` ← `vaccination_plans` (el plan asignado)
- `branch_name` ← `clinic_branches`; `vet_name` ← `users`
- `start_date`, `start_time` ← la propia asignación
- `doses` ← `pet_vaccination_doses` (`label`, `due_date`, `status`); `appointment_start` ← la
  cita agendada vinculada (`appointments.start_time` por `appointment_id`)

---

## Rediseño completo de la interfaz (Fases A–I)

**Fecha:** 2026-08-07

Rediseño UI/UX sobre la aplicación existente **sin tocar backend, endpoints, datos,
permisos ni rutas** (reglas de preservación). Dirección visual: *"papel clínico cálido"* +
verde clínico profundo, tipografía Plus Jakarta Sans (display) / Geist (UI) / Geist Mono.

### Fase A — App Shell
- Tokens nuevos en `styles/index.css`: paleta cálida (`--primary #1E6F5E`), semánticos
  afinados, sombras difusas, `--font-display/sans/mono`; se elimina el degradado de fondo
  por módulo y del body.
- `AppLayout`: sidebar 256px colapsable a 64px (solo iconos) en desktop, overlay en móvil;
  navegación agrupada (Principal / Módulos); item activo como píldora verde tintada;
  header limpio con blur; menú de perfil seccionado.

### Fase B — Design System (primitivas)
- Refactor: `Button` (pills, `soft-*`, `active:scale`), `Badge` (`soft-*`), `Input/Select/
  Textarea` (`rounded-lg` + fondo).
- Nuevos en `components/ui/`: `IconButton`, `Avatar`, `SearchInput`, `Checkbox`, `Switch`,
  `Tooltip`, `DropdownMenu` (Radix), `Drawer`, `ConfirmDialog`, `DatePicker`, `Toast`
  (provider + `Toaster` montado en el root) y `StatChip` (indicador compacto).

### Fase C — Dashboard
- Jerarquía "Hoy → Módulos → Dashboards": h1 Inicio, acciones rápidas con jerarquía
  (Nueva consulta dominante), KPIs "Resumen del día" arriba, gráfica + alertas + citas,
  drag&drop y bandeja intactos.

### Fase D — Expedientes
- `Avatar` en Dueño y Familia; `ConfirmDialog` para resolver alerta y eliminar aplicación
  del carnet (adopción de primitivas).

### Fase E — Agenda
- Tira de resumen del rango (Por atender / Pendientes / Completadas / Canceladas) calculada
  en frontend; selector Día/Semana en pills; botón "Atender (Nueva consulta)" en el detalle.

### Fase F — Pacientes
- Columna "Dueño" con `Avatar` en la lista; `SearchInput` con limpiar; columnas
  "Características" (xl+) y "Sexo" (lg+) ocultas en pantallas menores.

### Fase G — Inventario
- `SearchInput` con debounce; resumen Agotados/Stock bajo/Vencidos/Por vencer; tooltip
  explicando "Predicción"; columnas ocultas en pantallas menores.

### Fase H — Ventas / Facturación
- `StatChip` compartido (refactor de Agenda/Insumos); Facturación con Total cobrado /
  Pendientes por cobrar / Canceladas y badges soft; Servicios con resumen de catálogo.

### Fase I — Configuración / Admin
- Tabs en estilo pill; rol y estado como badges soft; columnas ocultas en pantallas menores.

### Pulido final (confirmado por el usuario)
- Migrados TODOS los `window.confirm` a `ConfirmDialog` (Waitlist, Vacunación, Productos,
  Configuración, Modo veterinario y Cartilla compartida). Ya no quedan confirmaciones
  nativas en el frontend.

### Verificación
- `lint` y `build` en verde; pruebas headless por fase (navegación, estados, modales,
  desktop/móvil). Sin errores de consola.

### Firma del médico veterinario (reutilizable)
- Migración `0029`: `users.signature_url` + `digital_consents.vet_user_id`.
- `POST/DELETE /users/me/signature`: guarda la firma dibujada del doctor (PNG) y la
  reutiliza en todos los consentimientos que emita.
- `Mi perfil` → tarjeta "Firma del médico": dibujar una vez, previsualizar, cambiar y
  eliminar; no requiere volver a firmar en cada documento.
- PDF de consentimiento ahora muestra **dos firmas lado a lado**: dueño y médico
  veterinario; la del doctor se incrusta tanto en el flujo en consulta (`/consents`)
  como en la firma remota de la cartilla compartida (`/share/cartilla/consents`).
- Fix de fondo: el flowable `Image(ImageReader(...))` de reportlab **siempre lanzaba
  TypeError** y la firma del dueño nunca se incrustaba (se ocultaba con try/except).
  Se corrigió usando `Image(io.BytesIO(...))`; verificado con `pdfimages` (2 imágenes
  RGBA por PDF) y `pdftotext`.

### Verificación (firma)
- Backend: `alembic upgrade head` + `ruff` en verde.
- E2E por API: subir firma → crear consentimiento en consulta → PDF con ambas firmas;
  flujo remoto (pending → firma del dueño) también incrusta la firma del vet.
- Frontend: `build` en verde; headless: tarjeta "Firma del médico" con firma guardada
  visible sin errores de consola.

### Flujo de consentimientos re diseñado: enviar → firmar → confirmar
- Migración `0030`: `digital_consents.confirmed_at`.
- Desde el perfil de la mascota ya NO se pide firma: "Enviar consentimiento" crea un
  `pending` que llega a la cartilla compartida del dueño.
- El dueño firma en su cartilla (status `owner_signed`, se guarda su firma, SIN PDF) y
  la envía de vuelta; la cartilla muestra "En espera".
- El staff lo CONFIRMA (`POST /consents/{id}/confirm`): se incluye la firma guardada del
  personal (de quien confirma, con respaldo a la del vet que emitió) y se genera el PDF
  imprimible con ambas firmas → status `signed` + `confirmed_at`.
- Se eliminó la firma en tablet en consulta (`POST /consents` con firma base64) y el
  esquema `ConsentCreate`.
- Verificado E2E (API + UI headless): pending → dueño firma → "En espera" en cartilla →
  staff confirma → "Confirmado" + "Ver PDF" en ambas vistas, PDF con 2 imágenes RGBA.

---

**Siguiente subfase:** por decidir (Fase 3 en hold).
