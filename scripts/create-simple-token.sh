#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Cloudflare Simple API Token Creator          ${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check if global API key is provided
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_GLOBAL_KEY" ]; then
    echo -e "${YELLOW}Please provide your Cloudflare credentials:${NC}"
    read -p "Email: " CLOUDFLARE_EMAIL
    read -s -p "Global API Key: " CLOUDFLARE_GLOBAL_KEY
    echo
fi

echo -e "\n${YELLOW}Creating API token with all zones permission...${NC}"

TOKEN_NAME="Cloudflare Firewall Manager - All Zones - $(date +%Y-%m-%d-%H%M%S)"

# Create a simple token with all zones permission
TOKEN_PAYLOAD=$(cat <<EOF
{
  "name": "${TOKEN_NAME}",
  "policies": [
    {
      "effect": "allow",
      "resources": {
        "com.cloudflare.api.account.*": "*",
        "com.cloudflare.api.account.zone.*": "*"
      },
      "permission_groups": [
        {
          "id": "c8fed203ed3043cba015a93ad1616f1f",
          "name": "Zone Read"
        },
        {
          "id": "e086da7e2179491d91ee5f35b3ca210a",
          "name": "Zone Settings Write"
        },
        {
          "id": "82e64a83756745bbbb1c9c2701bf816b",
          "name": "DNS Write"
        }
      ]
    }
  ]
}
EOF
)

echo -e "${YELLOW}Sending request to create token...${NC}"

CREATE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
  -H "Content-Type: application/json" \
  --data "${TOKEN_PAYLOAD}")

TOKEN_VALUE=$(echo "$CREATE_RESPONSE" | jq -r '.result.value')
TOKEN_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.id')
SUCCESS=$(echo "$CREATE_RESPONSE" | jq -r '.success')

if [ "$SUCCESS" != "true" ] || [ "$TOKEN_VALUE" == "null" ] || [ -z "$TOKEN_VALUE" ]; then
    echo -e "${RED}Failed to create token. Response:${NC}"
    echo "$CREATE_RESPONSE" | jq '.'
    
    echo -e "\n${YELLOW}Trying with API Token template permissions...${NC}"
    
    # Try using the Edit Zone template permissions
    TEMPLATE_PAYLOAD=$(cat <<EOF
{
  "name": "${TOKEN_NAME}",
  "policies": [
    {
      "id": "f267e341f3dd4697bd3b9f71dd96247f",
      "effect": "allow",
      "resources": {
        "com.cloudflare.api.account.zone.*": "*"
      },
      "permission_groups": [
        {
          "id": "e086da7e2179491d91ee5f35b3ca210a"
        }
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
      --data "${TEMPLATE_PAYLOAD}")
    
    TOKEN_VALUE=$(echo "$CREATE_RESPONSE" | jq -r '.result.value')
    TOKEN_ID=$(echo "$CREATE_RESPONSE" | jq -r '.result.id')
    SUCCESS=$(echo "$CREATE_RESPONSE" | jq -r '.success')
    
    if [ "$SUCCESS" != "true" ] || [ "$TOKEN_VALUE" == "null" ] || [ -z "$TOKEN_VALUE" ]; then
        echo -e "${RED}Failed to create token with template:${NC}"
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

# Save to file
echo "CLOUDFLARE_API_TOKEN=${TOKEN_VALUE}" > .env.production
echo -e "${GREEN}✓ Token saved to .env.production${NC}"

# Export for current session
export CLOUDFLARE_API_TOKEN="${TOKEN_VALUE}"
echo -e "${GREEN}✓ Token exported to current session${NC}\n"

# Update GitHub secret
echo -e "${YELLOW}Updating GitHub secret...${NC}"
gh secret set CLOUDFLARE_API_TOKEN --repo bozza-man/cloudflare_firewall --body "${TOKEN_VALUE}" 2>/dev/null && \
    echo -e "${GREEN}✓ GitHub secret updated${NC}" || \
    echo -e "${YELLOW}GitHub CLI not available or update failed${NC}"

# Test the token
echo -e "\n${YELLOW}Testing token...${NC}"
VERIFY_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer ${TOKEN_VALUE}" \
  -H "Content-Type: application/json")

VERIFY_STATUS=$(echo "$VERIFY_RESPONSE" | jq -r '.result.status')

if [ "$VERIFY_STATUS" == "active" ]; then
    echo -e "${GREEN}✓ Token verified and active!${NC}"
else
    echo -e "${YELLOW}Token verification response:${NC}"
    echo "$VERIFY_RESPONSE" | jq '.'
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Token created and ready to use!${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${YELLOW}You can now use this token to:${NC}"
echo -e "1. Deploy the Worker: npx wrangler deploy -c wrangler.production.toml"
echo -e "2. Configure custom domain manually in Cloudflare dashboard"
echo -e "3. Or use wrangler to add routes\n"
