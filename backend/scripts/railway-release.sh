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

if [ -n "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE:-}" ]; then
  if [ -n "${BACKFILL_PAYSTACK_PAYMENT_SHOP_EMAIL:-}" ]; then
    echo "Dry-running Paystack payment history backfill..."
    python manage.py backfill_paystack_payment \
      --shop-email "${BACKFILL_PAYSTACK_PAYMENT_SHOP_EMAIL}" \
      --reference "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE}" \
      --dry-run

    echo "Running Paystack payment history backfill..."
    python manage.py backfill_paystack_payment \
      --shop-email "${BACKFILL_PAYSTACK_PAYMENT_SHOP_EMAIL}" \
      --reference "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE}"
  elif [ -n "${BACKFILL_PAYSTACK_PAYMENT_SHOP_ID:-}" ]; then
    echo "Dry-running Paystack payment history backfill..."
    python manage.py backfill_paystack_payment \
      --shop-id "${BACKFILL_PAYSTACK_PAYMENT_SHOP_ID}" \
      --reference "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE}" \
      --dry-run

    echo "Running Paystack payment history backfill..."
    python manage.py backfill_paystack_payment \
      --shop-id "${BACKFILL_PAYSTACK_PAYMENT_SHOP_ID}" \
      --reference "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE}"
  else
    echo "Dry-running Paystack payment history backfill..."
    python manage.py backfill_paystack_payment \
      --reference "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE}" \
      --dry-run

    echo "Running Paystack payment history backfill..."
    python manage.py backfill_paystack_payment \
      --reference "${BACKFILL_PAYSTACK_PAYMENT_REFERENCE}"
  fi
fi
