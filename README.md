# Giztrack

Giztrack is a business management platform for tech-driven shops and growing
retail teams. It brings sales, inventory, customers, staff access, expenses,
reports, repairs, and subscription billing into one focused workspace.

The product is designed for businesses that need a clear view of stock, revenue,
customers, operations, and day-to-day shop activity without jumping between
separate tools.

## What Giztrack Does

- Manages point-of-sale records, payments, receipts, and profit visibility
- Tracks products, stock levels, suppliers, categories, and serialized devices
- Stores customer records linked to purchases, balances, and service history
- Supports staff roles for admins, technicians, and shop users
- Organizes repair and service jobs from intake to completion
- Provides reports for sales, inventory, expenses, customers, and operations
- Handles subscription access and billing through Paystack
- Supports installable web-app behavior for desktop and mobile use

## Technology Overview

Giztrack is built as a full-stack web application.

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | Django, Django REST Framework |
| Database | PostgreSQL |
| Background Jobs | Django Q2 |
| Payments | Paystack |
| Runtime | Gunicorn, Docker-ready deployment |

The backend follows a modular monolith structure: each business area lives in a
separate Django app, while the product remains simple to deploy and operate as
one main backend service.

## Repository Structure

```text
backend/      Django API, domain logic, billing, reports, and background jobs
frontend/     React application used by shop owners and staff
docs/         Internal engineering notes and development references
```

## Local Development

Create environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Run the development stack:

```bash
docker compose -f docker-compose.dev.yml up --build
```

Useful local URLs:

```text
Frontend: http://localhost:5173/
Backend:  http://localhost:8000/api/v1/health/
```

## Project Status

Giztrack is an actively developed SaaS product. The current focus is reliability
around billing, reporting accuracy, shop operations, and a smoother experience
for everyday business workflows.

## Security

Do not commit real credentials, API keys, database URLs, Paystack secrets, SMTP
credentials, or production environment files. Use the provided example files as
templates only.
