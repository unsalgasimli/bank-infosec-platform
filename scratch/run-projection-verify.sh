#!/usr/bin/env bash
# Disposable local PostgreSQL validation for the projection contention fix.
# Creates and removes exactly one uniquely named throwaway container.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="aegis-proj-verify-$RANDOM$RANDOM"
PASS="$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --detach --name "$NAME" --publish 127.0.0.1::5432 \
  --env "POSTGRES_PASSWORD=$PASS" --env POSTGRES_DB=projection_integration \
  postgres:16.9-alpine >/dev/null

for _ in $(seq 1 60); do
  docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
  sleep 1
done
PORT="$(docker port "$NAME" 5432/tcp | tr ':' '\n' | tail -1)"
echo "disposable postgres ready on 127.0.0.1:$PORT"

export DATABASE_URL="postgresql://postgres:$PASS@127.0.0.1:$PORT/projection_integration"
export DATA_ENCRYPTION_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export DB_TYPE=postgres DB_NAME=projection_integration DB_HOST=127.0.0.1 DB_PORT="$PORT"
export DB_USER=postgres DB_PASSWORD="$PASS" DB_SSL=false
export RUN_CMDB_DISCOVERY_INTEGRATION=1 CMDB_DISCOVERY_DISPOSABLE_DATABASE=1
export DATABASE_URL_FILE='' DATA_ENCRYPTION_KEY_FILE=''

echo '--- migrate ---'
node --import tsx src/server/db/postgres/migrate.ts

echo '--- ldap-atomic-projection integration test ---'
node --import tsx --test --test-concurrency=1 src/tests/ldap-atomic-projection.integration.test.ts

echo '--- projection contention verification ---'
node --import tsx scratch/verify-projection-contention.ts
