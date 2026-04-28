# Railway Deployment

This is the recommended production shape when using Railway for the backend and Cloudflare Pages for the frontend.

## Target architecture

- Frontend: Cloudflare Pages
- Backend web service: Railway
- Background worker: Railway
- Database: Railway PostgreSQL plugin
- Media: Cloudinary later, local media or Django-served media during initial setup
- Email: Resend SMTP

## Keep localhost untouched

Do not replace:

- `backend/.env`
- `backend/.env.local`
- `frontend/.env.local`

Production uses separate values instead:

- Railway service environment variables
- Cloudflare Pages environment variables

## Backend services on Railway

Create two backend services from the same repo:

1. `giztrack-api`
2. `giztrack-worker`

Attach the same Railway PostgreSQL database to both services.

## Commands

Use these commands in Railway:

- Release / predeploy command:
  `sh backend/scripts/railway-release.sh`
- Web start command:
  `sh backend/scripts/railway-web.sh`
- Worker start command:
  `sh backend/scripts/railway-worker.sh`

## Backend environment variables

Use [backend/.env.production.example](/Users/samuel/Documents/Techshopmananger/backend/.env.production.example) as the source template.

Important values:

- `SECRET_KEY`
- `DATABASE_URL` from Railway PostgreSQL
- `ALLOWED_HOSTS=api.your-domain.com`
- `FRONTEND_URL=https://app.your-domain.com`
- `BACKEND_URL=https://api.your-domain.com`
- `CORS_ALLOWED_ORIGINS=https://app.your-domain.com`
- `CSRF_TRUSTED_ORIGINS=https://app.your-domain.com,https://api.your-domain.com`
- `AUTH_COOKIE_DOMAIN=.your-domain.com`
- `USE_HTTPS=True`
- `EMAIL_HOST=smtp.resend.com`
- `EMAIL_HOST_USER=resend`
- `EMAIL_HOST_PASSWORD=<your resend api key>`

Budget-first Q2 defaults:

- `Q_CLUSTER_WORKERS=2`
- If cost pressure is high later, reduce worker concurrency before adding more services

## Frontend on Cloudflare Pages

Use [frontend/.env.production.example](/Users/samuel/Documents/Techshopmananger/frontend/.env.production.example) as the template.

Important value:

- `VITE_API_URL=https://api.your-domain.com/api/v1`

Suggested Pages settings:

- Root directory: `frontend`
- Build command: `npm run build`
- Build output directory: `dist`

## Domain layout

- `app.your-domain.com` -> Cloudflare Pages
- `api.your-domain.com` -> Railway backend service

## First verification checklist

1. Open `https://api.your-domain.com/api/v1/health/`
2. Open the frontend on `https://app.your-domain.com`
3. Test login and `auth/me`
4. Test password reset email
5. Test one image upload
6. Confirm the worker service stays healthy
7. Confirm scheduled jobs exist after deploy

## Budget notes

- Skip SMS at launch
- Keep only one web service and one worker service
- Use Resend free tier first
- Add Cloudinary after core flows are stable
