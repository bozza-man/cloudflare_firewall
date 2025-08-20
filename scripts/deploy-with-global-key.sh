#!/bin/bash

# Deploy Worker using Global API Key
# This provides full permissions for Worker deployment

echo "🔐 Configuring authentication with Global API Key..."

# Source the .env file
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Use Global Key authentication
export CLOUDFLARE_EMAIL="${CLOUDFLARE_EMAIL:-daniel@bruteforce.group}"
export CLOUDFLARE_API_KEY="$CLOUDFLARE_GLOBAL_KEY"

# Important: Unset the API token to force global key usage
unset CLOUDFLARE_API_TOKEN

if [ -z "$CLOUDFLARE_API_KEY" ]; then
    echo "❌ CLOUDFLARE_GLOBAL_KEY not found in environment"
    exit 1
fi

echo "📧 Email: $CLOUDFLARE_EMAIL"
echo "🔑 Using Global API Key authentication"

# First, create the KV namespace
echo "📦 Creating KV namespace..."
KV_OUTPUT=$(npx wrangler kv namespace create IDENTITY_DYNAMIC_THEME_STORE 2>&1)
echo "$KV_OUTPUT"

# Extract the KV namespace ID
KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | sed 's/id = "\([^"]*\)"/\1/')

if [ -n "$KV_ID" ]; then
    echo "✅ KV namespace created with ID: $KV_ID"
    
    # Update wrangler.toml with the KV namespace ID
    echo "📝 Updating wrangler.toml with KV namespace ID..."
    
    # Create a temporary file with the updated configuration
    cat > wrangler.toml.tmp << EOF
name = "cloudflare-dynamic-block-page"
main = "src/worker/index.ts"
compatibility_date = "2024-02-01"
workers_dev = false

[vars]
# BEARER_TOKEN = ""  # Set as secret: wrangler secret put BEARER_TOKEN
CORS_ORIGIN = "https://block.bozza.au"  # Update to your domain in production
ACCOUNT_ID = "0b0ee2b5eaf1fb8a2612e40ab6488052"  # Your Cloudflare account ID
ORGANIZATION_ID = ""  # Your Zero Trust organization ID
TARGET_GROUP = ""  # Optional: group to flag for special attention
DEBUG = "true"  # Set to "true" to enable debug page

# KV namespace for theme storage
[[kv_namespaces]]
binding = "IDENTITY_DYNAMIC_THEME_STORE"
id = "$KV_ID"

# Routes configuration
[[routes]]
pattern = "block.bozza.au/*"  # Replace with your custom domain
zone_name = "bozza.au"  # Replace with your zone

[build]
command = "npm run build:worker"

# Development configuration
[dev]
port = 8787
local_protocol = "http"
EOF
    
    mv wrangler.toml.tmp wrangler.toml
    echo "✅ wrangler.toml updated with KV namespace ID"
else
    echo "⚠️  Could not extract KV namespace ID, it may already exist"
fi

# Set the BEARER_TOKEN secret
echo "🔐 Setting BEARER_TOKEN secret..."
echo "$CLOUDFLARE_API_TOKEN" | npx wrangler secret put BEARER_TOKEN

# Build the Worker
echo "🔨 Building Worker..."
npm run build:worker

# Deploy the Worker
echo "🚀 Deploying Worker to Cloudflare..."
npx wrangler deploy

echo "✅ Deployment complete!"
echo ""
echo "📝 Next steps:"
echo "1. Visit https://block.bozza.au/access-denied to test the block page"
echo "2. Visit https://block.bozza.au/debug to configure the theme (debug mode enabled)"
echo "3. Update your Zero Trust organization settings to use this block page URL"
