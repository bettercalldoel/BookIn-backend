#!/usr/bin/env bash

set -euo pipefail

RAILWAY_BIN="${RAILWAY_BIN:-railway}"
PROJECT_ID="${RAILWAY_PROJECT_ID:-}"
PROJECT_NAME="${RAILWAY_PROJECT_NAME:-bookin-backend}"
SERVICE_NAME="${RAILWAY_SERVICE_NAME:-api}"
ENVIRONMENT_NAME="${RAILWAY_ENVIRONMENT:-production}"
PORT="${PORT:-8000}"
NODE_ENV="${NODE_ENV:-production}"
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-1h}"
EMAIL_VERIFICATION_TTL_MINUTES="${EMAIL_VERIFICATION_TTL_MINUTES:-60}"
PASSWORD_RESET_TTL_MINUTES="${PASSWORD_RESET_TTL_MINUTES:-60}"

required_envs=(
  APP_BASE_URL
  JWT_SECRET
  DATABASE_URL
  DIRECT_URL
)

for key in "${required_envs[@]}"; do
  if [ -z "${!key:-}" ]; then
    echo "Missing required environment variable: $key" >&2
    exit 1
  fi
done

if ! command -v "$RAILWAY_BIN" >/dev/null 2>&1; then
  echo "Railway CLI not found. Install with: npm i -g @railway/cli" >&2
  exit 1
fi

if ! "$RAILWAY_BIN" whoami >/dev/null 2>&1; then
  echo "Railway auth not found. Run 'railway login' or export RAILWAY_TOKEN." >&2
  exit 1
fi

if [ -n "$PROJECT_ID" ]; then
  "$RAILWAY_BIN" link --project "$PROJECT_ID" --environment "$ENVIRONMENT_NAME" >/dev/null
fi

if ! "$RAILWAY_BIN" status >/dev/null 2>&1; then
  "$RAILWAY_BIN" init --name "$PROJECT_NAME" >/dev/null
fi

if ! "$RAILWAY_BIN" service link "$SERVICE_NAME" >/dev/null 2>&1; then
  "$RAILWAY_BIN" add --service "$SERVICE_NAME" >/dev/null
  "$RAILWAY_BIN" service link "$SERVICE_NAME" >/dev/null
fi

CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-$APP_BASE_URL,*.vercel.app}"

base_vars=(
  "NODE_ENV=$NODE_ENV"
  "PORT=$PORT"
  "CORS_ALLOWED_ORIGINS=$CORS_ALLOWED_ORIGINS"
  "APP_BASE_URL=$APP_BASE_URL"
  "JWT_SECRET=$JWT_SECRET"
  "JWT_EXPIRES_IN=$JWT_EXPIRES_IN"
  "EMAIL_VERIFICATION_TTL_MINUTES=$EMAIL_VERIFICATION_TTL_MINUTES"
  "PASSWORD_RESET_TTL_MINUTES=$PASSWORD_RESET_TTL_MINUTES"
  "DATABASE_URL=$DATABASE_URL"
  "DIRECT_URL=$DIRECT_URL"
)

"$RAILWAY_BIN" variable set \
  --service "$SERVICE_NAME" \
  --environment "$ENVIRONMENT_NAME" \
  --skip-deploys \
  "${base_vars[@]}" >/dev/null

set_optional_var() {
  local key="$1"
  local value="${!key:-}"
  if [ -n "$value" ]; then
    "$RAILWAY_BIN" variable set \
      --service "$SERVICE_NAME" \
      --environment "$ENVIRONMENT_NAME" \
      --skip-deploys \
      "$key=$value" >/dev/null
  fi
}

optional_keys=(
  GOOGLE_CLIENT_ID
  SMTP_HOST
  SMTP_PORT
  SMTP_USER
  SMTP_PASS
  SMTP_FROM
  SMTP_SECURE
  CLOUDINARY_CLOUD_NAME
  CLOUDINARY_API_KEY
  CLOUDINARY_API_SECRET
  CLOUDINARY_UPLOAD_FOLDER
  XENDIT_SECRET_KEY
  XENDIT_CALLBACK_TOKEN
  XENDIT_API_BASE_URL
  XENDIT_INVOICE_EXPIRY_MINUTES
  BOOKING_PAYMENT_DUE_MINUTES
  BOOKING_PROOF_UPLOAD_DUE_MINUTES
)

for key in "${optional_keys[@]}"; do
  set_optional_var "$key"
done

"$RAILWAY_BIN" up \
  --service "$SERVICE_NAME" \
  --environment "$ENVIRONMENT_NAME" \
  --detach

echo
echo "Deployment triggered for Railway service '$SERVICE_NAME'."
echo "Checking service status..."
"$RAILWAY_BIN" status --json

echo
echo "Attempting to get/generate public domain..."
"$RAILWAY_BIN" domain --service "$SERVICE_NAME" --port "$PORT" --json || true
