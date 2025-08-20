#!/bin/bash

# Cloudflare Dynamic Block Page Deployment Script
# This script deploys the dynamic block page Worker to Cloudflare

set -e

echo "🚀 Starting deployment of Dynamic Block Page Worker..."

# Use npx to run wrangler (will download if needed)
echo "📦 Using npx to run wrangler..."

# Check for required environment variables
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ CLOUDFLARE_API_TOKEN environment variable is not set"
    exit 1
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "❌ CLOUDFLARE_ACCOUNT_ID environment variable is not set"
    exit 1
fi

# Create KV namespace if it doesn't exist
echo "📦 Creating KV namespace for theme storage..."
# Use sed instead of grep -P for macOS compatibility
KV_ID=$(npx wrangler kv:namespace create IDENTITY_DYNAMIC_THEME_STORE --preview false 2>/dev/null | sed -n 's/.*id = "\([^"]*\)".*/\1/p' || true)

if [ -n "$KV_ID" ]; then
    echo "✅ KV namespace created with ID: $KV_ID"
    echo "   Please update wrangler.toml with this ID"
else
    echo "ℹ️  KV namespace may already exist"
fi

# Set secrets
echo "🔐 Setting up Worker secrets..."
echo "$CLOUDFLARE_API_TOKEN" | npx wrangler secret put BEARER_TOKEN

# Build the Worker
echo "🔨 Building Worker..."
npm run build:worker

# Deploy the Worker
echo "🚀 Deploying Worker to Cloudflare..."
echo "ℹ️  Note: Due to network restrictions, you may need to:"
echo "   1. Deploy manually using the Cloudflare Dashboard"
echo "   2. Or run: curl -X PUT \"https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/cloudflare-dynamic-block-page\" \\"
echo "      -H \"Authorization: Bearer $CLOUDFLARE_API_TOKEN\" \\"
echo "      -H \"Content-Type: application/javascript\" \\"
echo "      --data-binary @dist/worker/index.js"
echo ""
echo "📝 Worker build completed at: dist/worker/index.js"

echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Update your Cloudflare Access applications to use the custom block page"
echo "2. Set the block page URL to: https://block.example.com/access-denied"
echo "3. Enable debug mode to configure theme: set DEBUG=true in wrangler.toml"
echo "4. Visit https://block.example.com/debug to customize the appearance"
echo ""
echo "🔧 Configuration checklist:"
echo "   [ ] API token with proper permissions created"
echo "   [ ] Access application configured"
echo "   [ ] Custom domain route configured"
echo "   [ ] Environment variables set in wrangler.toml"
echo "   [ ] KV namespace ID updated in wrangler.toml"
