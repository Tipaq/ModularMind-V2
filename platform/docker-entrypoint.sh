#!/bin/sh
set -e

echo "Running Prisma migrations..."
cd /app/platform && npx prisma db push --skip-generate 2>&1
echo "Database ready."

exec "$@"
