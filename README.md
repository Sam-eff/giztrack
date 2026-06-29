<div align="center">
  <h1>Giztrack</h1>
  <p><strong>Point-of-sale, inventory, procurement, and repair-shop management for tech repair businesses.</strong></p>
</div>

---

Giztrack is a full-stack SaaS platform for gadget and electronics repair shops.
It helps shop owners manage sales, stock, serialized devices, repairs, customers,
suppliers, staff roles, analytics, and subscription access from one dashboard.

The application is built around a multi-tenant model, so each registered shop has
its own isolated data, users, inventory, reports, and billing state.

## Core Features

- Multi-tenant shop accounts with scoped business data
- Point of sale with receipt-ready sales records and payment tracking
- Inventory management with stock levels, categories, suppliers, and product images
- Serialized unit tracking for IMEI/serial-number devices
- Repair ticket workflow from intake through collection
- Customer directory linked to purchases and repairs
- Supplier management and purchase orders
- Analytics for revenue, profit, expenses, stock, repairs, and customers
- Role-based access for admins, staff, and technicians
- Subscription billing integration with Paystack
- Background tasks with Django Q2
- Progressive Web App support for installable mobile/desktop use

## Tech Stack

| Area | Stack |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS, React Router, Axios |
| Backend | Python 3.12, Django, Django REST Framework |
| Database | PostgreSQL for Docker/production, SQLite-supported local fallback |
| Async jobs | Django Q2 |
| Media/static | Whitenoise, Cloudinary-ready media storage, Pillow |
| Observability | Sentry-ready frontend and backend configuration |
| Infrastructure | Docker, Docker Compose, Nginx, Gunicorn |

## Repository Map

- `frontend/` - React + Vite application served by Vite in dev and Nginx in production-like Docker.
- `backend/` - Django API, business apps, authentication, reports, and background jobs.
- `docker-compose.dev.yml` - hot-reload local development stack.
- `docker-compose.yml` - production-like local stack with built frontend and Gunicorn backend.
- `docs/` - development notes for local setup and troubleshooting.
- `PRODUCTION.md` - production rollout checklist and deployment direction.

## Local Development

For setup commands, environment variables, Docker workflows, and troubleshooting,
see [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md).

Quick start:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose -f docker-compose.dev.yml up --build
```

Development URLs:

- Frontend: `http://localhost:5173/`
- Backend API: `http://localhost:8000/api/v1/health/`

## Documentation

- [Development Guide](./docs/DEVELOPMENT.md)
- [Architecture Roadmap](./docs/ARCHITECTURE_ROADMAP.md)
- [Production Rollout](./PRODUCTION.md)

## Security Notes

Do not commit real `.env` files, API keys, SMTP credentials, Paystack keys, or
production secrets. The committed `.env.example` files are templates only.

---

<div align="center">
  <p>Built for tech repair shops that need stock, sales, and repairs in one place.</p>
</div>
