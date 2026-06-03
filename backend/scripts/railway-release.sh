#!/bin/sh
set -eu

echo "Running database migrations..."
python manage.py migrate --noinput

echo "Collecting static files..."
python manage.py collectstatic --noinput

echo "Setting up scheduled jobs..."
python manage.py setup_q_schedules

if [ "${RECONCILE_PAYSTACK_SUBSCRIPTIONS:-0}" = "1" ]; then
  echo "Dry-running Paystack subscription reconciliation..."
  python manage.py reconcile_paystack_subscriptions --dry-run

  echo "Running Paystack subscription reconciliation..."
  python manage.py reconcile_paystack_subscriptions
fi
