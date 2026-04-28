#!/bin/sh
set -eu

python manage.py setup_q_schedules
exec python manage.py qcluster
