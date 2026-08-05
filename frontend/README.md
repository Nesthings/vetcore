# VetCore — Frontend (React + Vite)

Aplicación web responsiva de VetCore. Sin PWA, sin service workers.

## Requisitos
- Node 20+

## Instalación

```bash
cd frontend
npm install
```

## Arrancar (dev)

```bash
npm run dev
```

El dev server corre en `http://localhost:5173` y proxya `/api` hacia el backend en `http://localhost:8001`.

## Build de producción

```bash
npm run build
```

## Lint / Format

```bash
npm run lint        # ESLint
npm run lint:fix    # ESLint con autocorrección
npm run format      # Prettier
```
