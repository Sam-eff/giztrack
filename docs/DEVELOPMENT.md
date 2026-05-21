# Development Guide

This guide covers local setup and Docker workflows for Giztrack.

## Prerequisites

- Docker and Docker Compose
- Node.js, only if you want to run the frontend outside Docker
- A configured backend environment file at `backend/.env`
- A configured frontend environment file at `frontend/.env`

## Environment Files

Create local environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

For local Docker, ensure `backend/.env` has a valid `SECRET_KEY` and any
integration keys you want to test. The compose files override `DATABASE_URL` so
the backend uses the Docker PostgreSQL service.

## Live-Reload Development Stack

Use this while actively building the app. It runs:

- PostgreSQL 16
- Django backend on `localhost:8000`
- Django Q2 worker
- Vite frontend on `localhost:5173`

```bash
docker compose -f docker-compose.dev.yml up --build
```

Useful URLs:

- Frontend: `http://localhost:5173/`
- Backend health: `http://localhost:8000/api/v1/health/`

Stop the stack:

```bash
docker compose -f docker-compose.dev.yml down
```

## Production-Like Docker Stack

Use this to test the built frontend behind Nginx and the backend behind Gunicorn.

```bash
docker compose up --build
```

Useful URLs:

- Application: `http://localhost/`
- Frontend health: `http://localhost/healthz`
- Backend health: `http://localhost:8000/api/v1/health/`

Stop the stack:

```bash
docker compose down
```

## Localhost Still Shows After Docker Stops

The production-like frontend is a PWA. Older local builds may have cached
`http://localhost/` in your browser through a service worker.

First verify whether a real server is running:

```bash
curl -I http://localhost/
```

If `curl` cannot connect but the browser still shows the app, the page is coming
from browser cache. Open browser DevTools, go to Application, unregister the
`localhost` service worker, then clear site data for `localhost`.

Current builds also unregister and clear Giztrack PWA caches automatically when
loaded from `localhost`.

## Common Commands

Run backend migrations inside the dev stack:

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py migrate
```

Open a Django shell:

```bash
docker compose -f docker-compose.dev.yml exec backend python manage.py shell
```

View backend logs:

```bash
docker compose -f docker-compose.dev.yml logs -f backend
```

View frontend logs:

```bash
docker compose -f docker-compose.dev.yml logs -f frontend
```

## Resetting Local Data

Stopping containers keeps named volumes, including the PostgreSQL data volume.
To reset local Docker data, remove volumes intentionally:

```bash
docker compose -f docker-compose.dev.yml down --volumes
```

That deletes local database and media volume data for the dev compose project.
