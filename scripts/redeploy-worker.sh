#!/bin/bash

# Ensure we use global key authentication
echo "🔐 Setting up global key authentication..."

# Get the global key from environment
GLOBAL_KEY="$CLOUDFLARE_GLOBAL_KEY"

if [ -z "$GLOBAL_KEY" ]; then
    echo "❌ CLOUDFLARE_GLOBAL_KEY not found"
    exit 1
fi

# Create a temporary environment with only global key auth
env -i \
    HOME="$HOME" \
    PATH="$PATH" \
    CLOUDFLARE_EMAIL="daniel@bruteforce.group" \
    CLOUDFLARE_API_KEY="$GLOBAL_KEY" \
    npx wrangler deploy

echo "✅ Deployment attempt complete"
