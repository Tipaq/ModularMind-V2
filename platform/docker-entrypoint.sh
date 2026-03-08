#!/bin/sh
set -e

echo "Running Prisma db push..."
cd /app/platform && node ../node_modules/prisma/build/index.js db push 2>&1
echo "Database ready."

exec "$@"
