#!/bin/bash

# Setup OAuth Authentication for Cloudflare MCP Servers
# This script will guide you through setting up OAuth authentication

echo "================================================"
echo "Cloudflare MCP OAuth Authentication Setup"
echo "================================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
fi

echo "To use Cloudflare MCP servers, you need to authenticate via OAuth."
echo ""
echo "Follow these steps:"
echo ""
echo "1. Visit: https://dash.cloudflare.com/profile/api-tokens"
echo "2. Create a new API token with the following permissions:"
echo "   - Account: Read"
echo "   - Zone: Read"
echo "   - Analytics: Read"
echo "   - Logs: Read"
echo "   - Gateway: Read"
echo ""
echo "3. Or use an existing API token with appropriate permissions"
echo ""

# Prompt for API token
read -p "Enter your Cloudflare API Token: " -s CF_API_TOKEN
echo ""

# Prompt for account ID (with current value as default)
CURRENT_ACCOUNT_ID="0b0ee2b5eaf1fb8a2612e40ab6488052"
read -p "Enter your Cloudflare Account ID (press Enter for $CURRENT_ACCOUNT_ID): " ACCOUNT_ID
ACCOUNT_ID=${ACCOUNT_ID:-$CURRENT_ACCOUNT_ID}

# Prompt for zone ID (with current value as default)
CURRENT_ZONE_ID="7249ad638510c628a7861d93535acbca"
read -p "Enter your Cloudflare Zone ID (press Enter for $CURRENT_ZONE_ID): " ZONE_ID
ZONE_ID=${ZONE_ID:-$CURRENT_ZONE_ID}

echo ""
echo "Updating configuration..."

# Update .env file with API credentials
if grep -q "^CLOUDFLARE_API_TOKEN=" .env; then
    sed -i.bak "s|^CLOUDFLARE_API_TOKEN=.*|CLOUDFLARE_API_TOKEN=$CF_API_TOKEN|" .env
else
    echo "CLOUDFLARE_API_TOKEN=$CF_API_TOKEN" >> .env
fi

if grep -q "^CLOUDFLARE_ACCOUNT_ID=" .env; then
    sed -i.bak "s|^CLOUDFLARE_ACCOUNT_ID=.*|CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID|" .env
else
    echo "CLOUDFLARE_ACCOUNT_ID=$ACCOUNT_ID" >> .env
fi

if grep -q "^CLOUDFLARE_ZONE_ID=" .env; then
    sed -i.bak "s|^CLOUDFLARE_ZONE_ID=.*|CLOUDFLARE_ZONE_ID=$ZONE_ID|" .env
else
    echo "CLOUDFLARE_ZONE_ID=$ZONE_ID" >> .env
fi

# Clean up backup files
rm -f .env.bak

# Update MCP config with OAuth bearer token support
echo ""
echo "Updating MCP configuration for OAuth..."

# Create updated MCP config with authentication headers
cat > .mcp/config.json << 'EOF'
{
  "mcpServers": {
    "cloudflare-bindings": {
      "command": "npx",
      "args": ["mcp-remote", "https://bindings.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-observability": {
      "command": "npx",
      "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-radar": {
      "command": "npx",
      "args": ["mcp-remote", "https://radar.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-browser": {
      "command": "npx",
      "args": ["mcp-remote", "https://browser.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-ai-gateway": {
      "command": "npx",
      "args": ["mcp-remote", "https://ai-gateway.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-auditlogs": {
      "command": "npx",
      "args": ["mcp-remote", "https://auditlogs.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-dns-analytics": {
      "command": "npx",
      "args": ["mcp-remote", "https://dns-analytics.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_ZONE_ID": "ZONE_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-docs": {
      "command": "npx",
      "args": ["mcp-remote", "https://docs.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-workers-builds": {
      "command": "npx",
      "args": ["mcp-remote", "https://builds.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    },
    "cloudflare-graphql": {
      "command": "npx",
      "args": ["mcp-remote", "https://graphql.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "ACCOUNT_ID_PLACEHOLDER",
        "CLOUDFLARE_ZONE_ID": "ZONE_ID_PLACEHOLDER",
        "CLOUDFLARE_API_TOKEN": "API_TOKEN_PLACEHOLDER"
      }
    }
  }
}
EOF

# Replace placeholders with actual values
sed -i.bak "s|ACCOUNT_ID_PLACEHOLDER|$ACCOUNT_ID|g" .mcp/config.json
sed -i.bak "s|ZONE_ID_PLACEHOLDER|$ZONE_ID|g" .mcp/config.json
sed -i.bak "s|API_TOKEN_PLACEHOLDER|$CF_API_TOKEN|g" .mcp/config.json

# Clean up backup files
rm -f .mcp/config.json.bak

echo ""
echo "✅ OAuth authentication setup complete!"
echo ""
echo "Configuration updated in:"
echo "  - .env (API credentials)"
echo "  - .mcp/config.json (MCP server configuration)"
echo ""
echo "Testing connection to MCP servers..."
echo ""

# Export environment variables for testing
export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
export CLOUDFLARE_ZONE_ID="$ZONE_ID"

# Test with a simple MCP command
npm start -- rules analyze --with-mcp --dry-run 2>/dev/null | head -20

echo ""
echo "If you see MCP connection errors above, please verify:"
echo "1. Your API token has the correct permissions"
echo "2. Your account ID and zone ID are correct"
echo "3. You have access to the Cloudflare MCP beta program"
echo ""
echo "To request MCP beta access, visit: https://developers.cloudflare.com/mcp"
