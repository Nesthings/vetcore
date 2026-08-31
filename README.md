# VetCore — Sistema de Gestión Veterinaria (SaaS multi-tenant)

> Fuente de verdad del producto: [`INSTRUCCIONES-PROYECTO.md`](./INSTRUCCIONES-PROYECTO.md)

## Estructura del repositorio

| Carpeta | Descripción |
|---|---|
| `backend/` | API FastAPI (Python 3.12) |
| `frontend/` | Web app React + Vite (TypeScript) |
| `docker-compose.yml` | PostgreSQL 16 local |

## Arranque rápido

```bash
# 1. Base de datos (PostgreSQL en el puerto 5433)
docker-compose up -d

# 2. Backend (puerto 8001)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
# → http://localhost:8001/api/v1/health

# 3. Frontend (puerto 5173)
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar. Contiene credenciales de PostgreSQL, secretos JWT y la config de Cloudflare R2 (se usa a partir de la Fase 1.4).

## Bitácora de desarrollo

Toda decisión y progreso por subfase se registra en [`BITACORA.md`](./BITACORA.md).
