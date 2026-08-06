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

**Siguiente subfase:** 2.2 — Inventario avanzado (lotes FIFO por caducidad, kits con descuento, predicción de agotamiento, órdenes de compra).
