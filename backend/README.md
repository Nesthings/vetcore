# VetCore — Backend (FastAPI)

## Requisitos
- Python 3.12+
- PostgreSQL 16 (arrancar con `docker compose up -d`)

## Instalación

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Variables de entorno

Copiar `.env.example` a `.env` (ya existe en la raíz del proyecto) y ajustar valores si es necesario.

## Arrancar

```bash
uvicorn app.main:app --reload --port 8001
```

El endpoint de salud está en `http://localhost:8001/health`.

## Linter / Formatter

```bash
ruff check .
ruff format .
```
