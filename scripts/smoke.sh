#!/usr/bin/env sh
set -e

PORT=${PORT:-8080}

echo "[SMOKE] GET /"
curl -i "http://localhost:${PORT}/" || true

echo "\n[SMOKE] GET /health"
curl -i "http://localhost:${PORT}/health" || true

echo "\n[SMOKE] OPTIONS /api/v1/templates (preflight)"
curl -i -X OPTIONS "http://localhost:${PORT}/api/v1/templates" \
  -H "Origin: https://rupantara-fronted.vercel.app" \
  -H "Access-Control-Request-Method: GET" || true

echo "\n[SMOKE] done"
