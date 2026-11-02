#!/bin/sh
# Builds IoT Studio with .env.production and publishes it to S3 behind CloudFront
# (iot.test.kokoon.pixxo.io). The bucket must hold only this app: files that are
# no longer in the build are deleted from it.
#
#   scripts/deploy-s3.sh <bucket> <cloudfront-distribution-id>
#
# Needs the AWS CLI logged in with s3:PutObject/DeleteObject/ListBucket on the
# bucket and cloudfront:CreateInvalidation on the distribution.
set -eu

BUCKET=${1:?usage: scripts/deploy-s3.sh <bucket> <cloudfront-distribution-id>}
DIST_ID=${2:?usage: scripts/deploy-s3.sh <bucket> <cloudfront-distribution-id>}

cd "$(dirname "$0")/.."
grep -q '"name": *"kokoon-iot-studio"' package.json || { echo "not the IoT Studio frontend folder" >&2; exit 1; }
grep -q '^VITE_API_BASE_URL=https://' .env.production || { echo ".env.production needs an https VITE_API_BASE_URL" >&2; exit 1; }

npm ci
npm run build

# 1. Hashed assets first (cached for a year), so the new index.html never points at a missing file
aws s3 sync dist/assets "s3://$BUCKET/assets" --only-show-errors \
  --cache-control "public,max-age=31536000,immutable"
# 2. Everything else (index.html, favicon, ...) is revalidated on every load
aws s3 sync dist "s3://$BUCKET" --only-show-errors --delete --exclude 'assets/*' \
  --cache-control "no-cache"
# 3. Now drop assets the new build no longer uses
aws s3 sync dist/assets "s3://$BUCKET/assets" --only-show-errors --delete \
  --cache-control "public,max-age=31536000,immutable"

aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/" "/index.html" \
  --query 'Invalidation.Id' --output text

echo "published to s3://$BUCKET (CloudFront $DIST_ID)"
