#!/bin/bash
set -e

# 从 .env 加载变量
if [ -f "$(dirname "$0")/.env" ]; then
  export $(grep -v '^#' "$(dirname "$0")/.env" | xargs)
fi

if [ -z "$VERCEL_TOKEN" ]; then
  echo "Error: VERCEL_TOKEN is not set."
  exit 1
fi

echo "==> Building for production..."
npx vercel --token "$VERCEL_TOKEN" build --prod --yes

echo "==> Deploying to production..."
npx vercel --token "$VERCEL_TOKEN" deploy --prebuilt --prod --yes

echo "==> Done: https://life-rpg-flame.vercel.app"
