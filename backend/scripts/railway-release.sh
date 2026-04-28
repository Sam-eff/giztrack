#!/bin/sh
set -eu

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py setup_q_schedules
