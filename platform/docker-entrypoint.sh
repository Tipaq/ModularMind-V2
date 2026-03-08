#!/bin/sh
set -e

echo "Running Prisma db push..."
cd /app/platform && npx prisma db push 2>&1
echo "Database ready."

exec "$@"
