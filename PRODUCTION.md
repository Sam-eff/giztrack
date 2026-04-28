# Giztrack Production Rollout

This file is a placeholder rollout guide while the project is being stabilized locally with Docker first.

The current production direction is:

- Frontend and edge concerns on Cloudflare
- Backend/runtime on Railway

Do not treat older Vercel or Hugging Face deploy glue as active infrastructure.

## 1. Minimum Production Services

- PostgreSQL for application data
- Django Q2 worker process for async jobs
- S3-compatible object storage for media/uploads
- Sentry for error monitoring
- Transactional email provider such as Postmark, Resend, Brevo, or Amazon SES
- Paystack live keys and verified webhook delivery

## 2. Recommended Environments

- Local Docker: current developer setup and source of truth
- Staging: Railway/Cloudflare mirror once local Docker is stable
- Production: real customer-facing environment

Do not deploy directly from local development to production without validating on staging first.

## 3. Required Environment Files

- Backend production example: [backend/.env.production.example](backend/.env.production.example)
- Frontend production example: [frontend/.env.production.example](frontend/.env.production.example)

## 4. Health Endpoints

- Backend app health: `/api/v1/health/`
- Frontend/Nginx health: `/healthz`

Use these endpoints for uptime monitoring and container/platform health checks.

## 5. Pre-Launch Checklist

- Configure production env vars and secrets outside the repository
- Turn on HTTPS and secure cookies
- Set `SERVE_MEDIA=False` when media is handled by object storage or upstream Nginx/CDN
- Run database migrations on staging first
- Test password reset emails with the real email provider
- Test Paystack payment, callback, cancel flow, and webhook delivery
- Test image uploads and retrieval from production media storage
- Confirm Sentry receives backend and frontend errors
- Configure automated backups for database and media
- Test one real restore before launch

## 6. Deployment Safety

- Use the CI workflow in `.github/workflows/ci.yml`
- Tag releases so rollback is easy
- Take a database backup before every production deploy
- Keep the previous release artifact or image available

## 7. If Something Breaks

1. Pause further deploys
2. Check Sentry and uptime alerts
3. Roll back the application to the previous stable release
4. Restore database or media only if data was damaged
5. Reconcile Paystack events if any billing activity happened after the restored backup point

## 8. First Improvements After Launch

- Add admin 2FA
- Add audit logs for billing/admin actions
- Add product analytics such as PostHog
- Add automated blue-green deployment when traffic/revenue justify it
