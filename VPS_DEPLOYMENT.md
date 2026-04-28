# VPS Deployment

This repo can be deployed to a single small VPS without changing the local Docker workflow.

## Suggested shape

- Frontend: Cloudflare Pages
- Backend API: Ubuntu VPS
- Database: PostgreSQL on the same VPS
- Reverse proxy: Nginx
- App server: Gunicorn
- Background jobs: Django Q2 only after the web service is stable
- Email: Resend via SMTP
- Media: start with local disk or add Cloudinary later

## Keep localhost untouched

Do not replace the existing local files:

- `backend/.env`
- `backend/.env.local`
- `frontend/.env.local`

Use separate production values instead:

- `backend/.env.production`
- Cloudflare Pages dashboard environment variables

## Frontend production values

Use [frontend/.env.production.example](/Users/samuel/Documents/Techshopmananger/frontend/.env.production.example) as the template.

Important:

- `VITE_API_URL` must point to the full backend API origin, for example `https://api.your-domain.com/api/v1`

## Backend production values

Use [backend/.env.production.example](/Users/samuel/Documents/Techshopmananger/backend/.env.production.example) as the template.

Important:

- `FRONTEND_URL=https://app.your-domain.com`
- `BACKEND_URL=https://api.your-domain.com`
- `AUTH_COOKIE_DOMAIN=.your-domain.com`
- `USE_HTTPS=True`
- `SERVE_MEDIA=False` when media is handled outside Django

## VPS baseline

Recommended starting size:

- Ubuntu 24.04 LTS
- 1 vCPU
- 1 GB RAM
- 25 GB SSD

## First deploy order

1. Create the VPS and point `api.your-domain.com` to it.
2. Install Python, PostgreSQL, Nginx, and certbot.
3. Copy backend code to the VPS.
4. Create `backend/.env.production`.
5. Run migrations and collect static files.
6. Start Gunicorn under `systemd`.
7. Put Nginx in front with HTTPS.
8. Deploy the frontend to Cloudflare Pages with `VITE_API_URL=https://api.your-domain.com/api/v1`.
9. Verify login, CSRF, cookies, image upload, Paystack callback, and password reset email.

## Budget-first notes

- Skip SMS at launch.
- Delay the always-on Q2 worker until the core app is stable.
- Use Resend free tier first.
- Use Cloudinary only when you want off-server media storage.
