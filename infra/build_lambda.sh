#!/usr/bin/env bash
# Empaqueta el backend para la Lambda worker (app/lambda_worker.handler).
# Usa un venv de EMPAQUETADO con wheels manylinux (compatibles con Amazon Linux).
#   LAMBDA_VENV=...  ruta del venv de empaquetado (default: ./backend/.venv-lambda)
# Uso: ./infra/build_lambda.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAMBDA_VENV="${LAMBDA_VENV:-$ROOT/backend/.venv-lambda}"
SITE="$LAMBDA_VENV/lib/python3.12/site-packages"
DIST="$ROOT/infra/lambda.zip"

if [ ! -d "$SITE" ]; then
  echo "No se encontró el venv de empaquetado en $SITE" >&2
  echo "Créalo con wheels manylinux:" >&2
  echo "  python3.12 -m venv backend/.venv-lambda" >&2
  echo "  backend/.venv-lambda/bin/pip install --only-binary=:all: -r backend/requirements.txt" >&2
  exit 1
fi

rm -f "$DIST"
cd "$SITE"
# Excluimos lo que ya provee el runtime de Lambda (boto3/botocore) y pesos muertos.
# NOTA: NO excluimos *.dist-info porque psycopg/importlib.metadata los necesita
# para reportar la versión (si no, SQLAlchemy falla con "psycopg version 3.0.2...").
zip -rq "$DIST" . \
  -x "*.pyc" \
  -x "pip/*" -x "pip-*" \
  -x "setuptools*" \
  -x "wheel*" \
  -x "boto3/*" -x "boto3-*" \
  -x "botocore/*" -x "botocore-*" \
  -x "s3transfer/*" -x "s3transfer-*" \
  -x "urllib3/*" -x "urllib3-*" \
  -x "__pycache__/*"

cd "$ROOT/backend"
zip -rq "$DIST" app -x "*/__pycache__/*" -x "*.pyc"

echo "Lambda package: $DIST ($(du -h "$DIST" | cut -f1))"
