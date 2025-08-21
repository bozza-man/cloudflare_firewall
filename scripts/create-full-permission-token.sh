#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Cloudflare API Token Creator - Full Access   ${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check if global API key is provided
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_GLOBAL_KEY" ]; then
    echo -e "${YELLOW}Please provide your Cloudflare credentials:${NC}"
    read -p "Email: " CLOUDFLARE_EMAIL
    read -s -p "Global API Key: " CLOUDFLARE_GLOBAL_KEY
    echo
fi

ACCOUNT_ID="0b0ee2b5eaf1fb8a2612e40ab6488052"

echo -e "\n${YELLOW}Step 1: Getting zone ID for bozza.au...${NC}"

# Get zone ID
ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=bozza.au" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
  -H "Content-Type: application/json")

ZONE_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result[0].id')

if [ "$ZONE_ID" == "null" ] || [ -z "$ZONE_ID" ]; then
    echo -e "${RED}Failed to get zone ID. Response:${NC}"
    echo "$ZONE_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✓ Zone ID: ${ZONE_ID}${NC}\n"

# Create token with full permissions
echo -e "${YELLOW}Step 2: Creating API token with comprehensive permissions...${NC}"

TOKEN_NAME="Cloudflare Firewall Manager - $(date +%Y-%m-%d)"

# Using actual permission group IDs from Cloudflare
TOKEN_PAYLOAD=$(cat <<EOF
{
  "name": "${TOKEN_NAME}",
  "policies": [
    {
      "effect": "allow",
      "resources": {
        "com.cloudflare.api.account.${ACCOUNT_ID}": "*"
      },
      "permission_groups": [
        "c1fde68c7bcc44588cbb6ddbc16d6480",
        "1a71c399447a4097ac4e3d47b2e2b4e5",
        "f7f0eda5697f475c90846e879bab8666",
        "2df70883747742589491dca19a752607",
        "6e8783fce2554bc7bcb1ada73b92ce23",
        "8a78fc561a834c25a03e6dc9f4a385f4",
        "d8b9aae08dc94af2928e1e09fa8f5690",
        "e17beae8b8cb423a99b1730f21238bed",
        "82b3c18e1dd446de97ff67ea2dc3c62e",
        "0b7c25468ca848b6b5af3c8815ad1f34"
      ]
    },
    {
      "effect": "allow",
      "resources": {
        "com.cloudflare.api.account.zone.${ZONE_ID}": "*"
      },
      "permission_groups": [
        "e086da7e2179491d91ee5f35b3ca210a",
        "82e64a83756745bbbb1c9c2701bf816b",
        "c8fed203ed3043cba015a93ad1616f1f"
      ]
    }
  ]
}
EOF
)

CREATE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
  -H "Content-Type: application/json" \
  --data "${TOKEN_PAYLOAD}")

TOKEN_VALUE=$(echo "$CREATE_RESPONSE" | jq -r '.result.value')
TOKEN_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.id')

if [ "$TOKEN_VALUE" == "null" ] || [ -z "$TOKEN_VALUE" ]; then
    echo -e "${RED}Failed to create token. Trying with minimal permissions...${NC}"
    
    # Fallback to minimal permissions that should work
    MINIMAL_PAYLOAD=$(cat <<EOF
{
  "name": "${TOKEN_NAME}",
  "policies": [
    {
      "effect": "allow",
      "resources": {
        "com.cloudflare.api.account.${ACCOUNT_ID}": "*",
        "com.cloudflare.api.account.zone.*": "*"
      },
      "permission_groups": [
        "c8fed203ed3043cba015a93ad1616f1f",
        "e086da7e2179491d91ee5f35b3ca210a",
        "82e64a83756745bbbb1c9c2701bf816b"
      ]
    }
  ]
}
EOF
)
    
    CREATE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
      -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
      -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
      -H "Content-Type: application/json" \
      --data "${MINIMAL_PAYLOAD}")
    
    TOKEN_VALUE=$(echo "$CREATE_RESPONSE" | jq -r '.result.value')
    TOKEN_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.id')
    
    if [ "$TOKEN_VALUE" == "null" ] || [ -z "$TOKEN_VALUE" ]; then
        echo -e "${RED}Failed to create token:${NC}"
        echo "$CREATE_RESPONSE" | jq '.'
        exit 1
    fi
fi

echo -e "${GREEN}✓ Token created successfully!${NC}\n"

# Display token information
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Token Information:${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Name: ${TOKEN_NAME}"
echo -e "ID: ${TOKEN_ID}"
echo -e "\n${YELLOW}Token Value:${NC}"
echo -e "${BLUE}${TOKEN_VALUE}${NC}"
echo -e "\n${RED}⚠️  SAVE THIS TOKEN NOW! It won't be shown again.${NC}\n"

# Test the token
echo -e "${YELLOW}Step 3: Verifying token...${NC}"

VERIFY_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer ${TOKEN_VALUE}" \
  -H "Content-Type: application/json")

VERIFY_STATUS=$(echo "$VERIFY_RESPONSE" | jq -r '.result.status')

if [ "$VERIFY_STATUS" == "active" ]; then
    echo -e "${GREEN}✓ Token verified and active!${NC}\n"
else
    echo -e "${YELLOW}Token verification response:${NC}"
    echo "$VERIFY_RESPONSE" | jq '.'
fi

# Update local environment
echo -e "${YELLOW}Step 4: Updating environment...${NC}"

# Save to .env file
echo "CLOUDFLARE_API_TOKEN=${TOKEN_VALUE}" > .env.production
echo -e "${GREEN}✓ Token saved to .env.production${NC}"

# Export for current session
export CLOUDFLARE_API_TOKEN="${TOKEN_VALUE}"
echo -e "${GREEN}✓ Token exported to current session${NC}\n"

# Update GitHub secret
echo -e "${YELLOW}Step 5: Updating GitHub secret...${NC}"

if command -v gh &> /dev/null; then
    gh secret set CLOUDFLARE_API_TOKEN --repo bozza-man/cloudflare_firewall --body "${TOKEN_VALUE}"
    echo -e "${GREEN}✓ GitHub secret updated${NC}\n"
else
    echo -e "${YELLOW}GitHub CLI not found. To update the secret manually:${NC}"
    echo -e "gh secret set CLOUDFLARE_API_TOKEN --repo bozza-man/cloudflare_firewall --body \"${TOKEN_VALUE}\"\n"
fi

# Deploy the Worker
echo -e "${YELLOW}Step 6: Deploying Worker with new token...${NC}"

npx wrangler deploy -c wrangler.production.toml

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "\nYour Worker should now be deployed with full permissions."
echo -e "The custom domain firewall.bozza.au should be automatically configured.\n"

# Set up custom domain
echo -e "${YELLOW}Step 7: Setting up custom domain...${NC}"

# Create DNS record
echo -e "Creating DNS record for firewall.bozza.au..."
DNS_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${TOKEN_VALUE}" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "AAAA",
    "name": "firewall",
    "content": "100::",
    "ttl": 1,
    "proxied": true
  }')

DNS_SUCCESS=$(echo "$DNS_RESPONSE" | jq -r '.success')

if [ "$DNS_SUCCESS" == "true" ]; then
    echo -e "${GREEN}✓ DNS record created${NC}"
else
    echo -e "${YELLOW}DNS record may already exist or failed to create${NC}"
fi

# Create Worker route
echo -e "Creating Worker route for firewall.bozza.au..."
ROUTE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes" \
  -H "Authorization: Bearer ${TOKEN_VALUE}" \
  -H "Content-Type: application/json" \
  --data '{
    "pattern": "firewall.bozza.au/*",
    "script": "cloudflare-firewall-manager"
  }')

ROUTE_SUCCESS=$(echo "$ROUTE_RESPONSE" | jq -r '.success')

if [ "$ROUTE_SUCCESS" == "true" ]; then
    echo -e "${GREEN}✓ Worker route created${NC}"
else
    echo -e "${YELLOW}Worker route may already exist or failed to create${NC}"
fi

echo -e "\n${GREEN}🎉 All done! Your Worker should be accessible at:${NC}"
echo -e "${BLUE}https://firewall.bozza.au${NC}\n"
