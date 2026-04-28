#!/bin/sh
set -eu

PORT="${PORT:-8000}"
WEB_CONCURRENCY="${WEB_CONCURRENCY:-2}"
GUNICORN_TIMEOUT="${GUNICORN_TIMEOUT:-120}"

exec gunicorn config.wsgi:application \
  --bind "0.0.0.0:${PORT}" \
  --workers "${WEB_CONCURRENCY}" \
  --timeout "${GUNICORN_TIMEOUT}"
