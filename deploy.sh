#!/bin/bash
set -e

# 从环境变量读取 token，或在此处手动设置
# export VERCEL_TOKEN="your_token_here"
if [ -z "$VERCEL_TOKEN" ]; then
  echo "Error: VERCEL_TOKEN is not set."
  echo "Run: export VERCEL_TOKEN=your_token && ./deploy.sh"
  exit 1
fi

echo "==> Building for production..."
npx vercel --token "$VERCEL_TOKEN" build --prod --yes

echo "==> Deploying to production..."
npx vercel --token "$VERCEL_TOKEN" deploy --prebuilt --prod --yes

echo "==> Done: https://life-rpg-flame.vercel.app"
