#!/usr/bin/env bash

set -euo pipefail

KOYEB_BIN="${KOYEB_BIN:-$HOME/.koyeb/bin/koyeb}"
APP_NAME="${APP_NAME:-bookin-backend}"
SERVICE_NAME="${SERVICE_NAME:-api}"
GIT_REPO="${GIT_REPO:-github.com/bettercalldoel/BookIn-backend}"
GIT_BRANCH="${GIT_BRANCH:-main}"
KOYEB_REGION="${KOYEB_REGION:-was}"
PORT="${PORT:-8000}"
NODE_ENV="${NODE_ENV:-production}"
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-1h}"
EMAIL_VERIFICATION_TTL_MINUTES="${EMAIL_VERIFICATION_TTL_MINUTES:-60}"
PASSWORD_RESET_TTL_MINUTES="${PASSWORD_RESET_TTL_MINUTES:-60}"

required_envs=(
  KOYEB_TOKEN
  DATABASE_URL
  DIRECT_URL
  APP_BASE_URL
  JWT_SECRET
)

for key in "${required_envs[@]}"; do
  if [ -z "${!key:-}" ]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
done

if [ ! -x "$KOYEB_BIN" ]; then
  echo "Koyeb CLI not found at: $KOYEB_BIN" >&2
  echo "Install it first, or set KOYEB_BIN to the correct path." >&2
  exit 1
fi

CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-$APP_BASE_URL,*.vercel.app}"

create_or_update_flags=(
  --token "$KOYEB_TOKEN"
  --git "$GIT_REPO"
  --git-branch "$GIT_BRANCH"
  --git-builder docker
  --git-docker-dockerfile Dockerfile
  --ports "${PORT}:http"
  --routes "/:${PORT}"
  --checks "${PORT}:http:/healthz"
  --instance-type nano
  --regions "$KOYEB_REGION"
  --min-scale 1
  --max-scale 1
  --env "NODE_ENV=$NODE_ENV"
  --env "PORT=$PORT"
  --env "CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS"
  --env "APP_BASE_URL=$APP_BASE_URL"
  --env "JWT_SECRET=$JWT_SECRET"
  --env "JWT_EXPIRES_IN=$JWT_EXPIRES_IN"
  --env "EMAIL_VERIFICATION_TTL_MINUTES=$EMAIL_VERIFICATION_TTL_MINUTES"
  --env "PASSWORD_RESET_TTL_MINUTES=$PASSWORD_RESET_TTL_MINUTES"
  --env "DATABASE_URL=$DATABASE_URL"
  --env "DIRECT_URL=$DIRECT_URL"
  --wait
  --wait-timeout 15m
)

if "$KOYEB_BIN" service get "$SERVICE_NAME" --app "$APP_NAME" --token "$KOYEB_TOKEN" >/dev/null 2>&1; then
  echo "Updating existing Koyeb service: $APP_NAME/$SERVICE_NAME"
  "$KOYEB_BIN" service update "$SERVICE_NAME" --app "$APP_NAME" "${create_or_update_flags[@]}"
else
  if ! "$KOYEB_BIN" app get "$APP_NAME" --token "$KOYEB_TOKEN" >/dev/null 2>&1; then
    echo "Creating Koyeb app: $APP_NAME"
    "$KOYEB_BIN" app create "$APP_NAME" --token "$KOYEB_TOKEN"
  fi

  echo "Creating Koyeb service: $APP_NAME/$SERVICE_NAME"
  "$KOYEB_BIN" service create "$SERVICE_NAME" --app "$APP_NAME" "${create_or_update_flags[@]}"
fi

echo
echo "Service deployed. Fetching endpoint details..."
"$KOYEB_BIN" service get "$SERVICE_NAME" --app "$APP_NAME" --token "$KOYEB_TOKEN" -o yaml
