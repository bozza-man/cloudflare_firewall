#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}  Cloudflare Setup Using Global API Key        ${NC}"
echo -e "${BLUE}================================================${NC}\n"

# Check if global API key is provided
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_GLOBAL_KEY" ]; then
    echo -e "${YELLOW}Please provide your Cloudflare credentials:${NC}"
    read -p "Email: " CLOUDFLARE_EMAIL
    read -s -p "Global API Key: " CLOUDFLARE_GLOBAL_KEY
    echo
fi

ACCOUNT_ID="0b0ee2b5eaf1fb8a2612e40ab6488052"

echo -e "\n${YELLOW}Step 1: Getting zone information...${NC}"

# Get zone ID
ZONE_RESPONSE=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones?name=bozza.au" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
  -H "Content-Type: application/json")

ZONE_ID=$(echo "$ZONE_RESPONSE" | jq -r '.result[0].id')

if [ "$ZONE_ID" == "null" ] || [ -z "$ZONE_ID" ]; then
    echo -e "${RED}Failed to get zone ID${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Zone ID: ${ZONE_ID}${NC}\n"

# Set up custom domain
echo -e "${YELLOW}Step 2: Setting up DNS record for firewall.bozza.au...${NC}"

# Check if DNS record already exists
DNS_CHECK=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?name=firewall.bozza.au" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
  -H "Content-Type: application/json")

EXISTING_DNS=$(echo "$DNS_CHECK" | jq -r '.result[0].id')

if [ "$EXISTING_DNS" != "null" ] && [ ! -z "$EXISTING_DNS" ]; then
    echo -e "${YELLOW}DNS record already exists, updating...${NC}"
    
    # Update existing record
    DNS_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${EXISTING_DNS}" \
      -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
      -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
      -H "Content-Type: application/json" \
      --data '{
        "type": "AAAA",
        "name": "firewall",
        "content": "100::",
        "ttl": 1,
        "proxied": true
      }')
else
    # Create new DNS record
    DNS_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
      -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
      -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
      -H "Content-Type: application/json" \
      --data '{
        "type": "AAAA",
        "name": "firewall",
        "content": "100::",
        "ttl": 1,
        "proxied": true
      }')
fi

DNS_SUCCESS=$(echo "$DNS_RESPONSE" | jq -r '.success')

if [ "$DNS_SUCCESS" == "true" ]; then
    echo -e "${GREEN}✓ DNS record configured${NC}"
else
    echo -e "${YELLOW}DNS record configuration issue:${NC}"
    echo "$DNS_RESPONSE" | jq '.errors'
fi

echo -e "\n${YELLOW}Step 3: Setting up Worker route...${NC}"

# Check existing routes
ROUTES_CHECK=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes" \
  -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
  -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
  -H "Content-Type: application/json")

# Check if route for firewall.bozza.au already exists
EXISTING_ROUTE=$(echo "$ROUTES_CHECK" | jq -r '.result[] | select(.pattern == "firewall.bozza.au/*") | .id')

if [ ! -z "$EXISTING_ROUTE" ] && [ "$EXISTING_ROUTE" != "null" ]; then
    echo -e "${YELLOW}Route already exists, updating...${NC}"
    
    # Update existing route
    ROUTE_RESPONSE=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes/${EXISTING_ROUTE}" \
      -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
      -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
      -H "Content-Type: application/json" \
      --data '{
        "pattern": "firewall.bozza.au/*",
        "script": "cloudflare-firewall-manager"
      }')
else
    # Create new route
    ROUTE_RESPONSE=$(curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes" \
      -H "X-Auth-Email: ${CLOUDFLARE_EMAIL}" \
      -H "X-Auth-Key: ${CLOUDFLARE_GLOBAL_KEY}" \
      -H "Content-Type: application/json" \
      --data '{
        "pattern": "firewall.bozza.au/*",
        "script": "cloudflare-firewall-manager"
      }')
fi

ROUTE_SUCCESS=$(echo "$ROUTE_RESPONSE" | jq -r '.success')

if [ "$ROUTE_SUCCESS" == "true" ]; then
    echo -e "${GREEN}✓ Worker route configured${NC}"
else
    echo -e "${YELLOW}Worker route configuration issue:${NC}"
    echo "$ROUTE_RESPONSE" | jq '.errors'
fi

echo -e "\n${YELLOW}Step 4: Deploying Worker...${NC}"

# Use Global API Key for deployment
export CLOUDFLARE_EMAIL="${CLOUDFLARE_EMAIL}"
export CLOUDFLARE_API_KEY="${CLOUDFLARE_GLOBAL_KEY}"

# Deploy using wrangler with Global API Key
npx wrangler deploy -c wrangler.production.toml 2>&1 | tee deploy.log

if grep -q "Uploaded" deploy.log; then
    echo -e "\n${GREEN}✓ Worker deployed successfully${NC}"
else
    echo -e "\n${YELLOW}Worker deployment may have issues. Check deploy.log for details${NC}"
fi

rm -f deploy.log

echo -e "\n${YELLOW}Step 5: Testing custom domain...${NC}"

sleep 3  # Wait for propagation

# Test the custom domain
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://firewall.bozza.au/health")

if [ "$RESPONSE" == "200" ]; then
    echo -e "${GREEN}✅ Custom domain is working!${NC}"
    echo -e "${GREEN}Visit: https://firewall.bozza.au${NC}"
else
    echo -e "${YELLOW}Custom domain is still propagating (HTTP ${RESPONSE})${NC}"
    echo -e "Try again in a few minutes: curl https://firewall.bozza.au/health"
fi

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Important Next Steps:${NC}"
echo -e "1. Create an API token manually at: https://dash.cloudflare.com/profile/api-tokens"
echo -e "2. Required permissions:"
echo -e "   - Account: Workers Scripts:Edit"
echo -e "   - Account: Workers KV Storage:Edit"
echo -e "   - Account: Workers R2 Storage:Edit"
echo -e "   - Account: D1:Edit"
echo -e "   - Zone: DNS:Edit"
echo -e "   - Zone: Workers Routes:Edit"
echo -e "3. Update GitHub secret: gh secret set CLOUDFLARE_API_TOKEN --body 'your-new-token'"
echo -e "4. Update local .env: echo 'CLOUDFLARE_API_TOKEN=your-new-token' > .env.production"

echo -e "\n${RED}Security: Clear your Global API Key from environment:${NC}"
echo -e "unset CLOUDFLARE_EMAIL CLOUDFLARE_API_KEY CLOUDFLARE_GLOBAL_KEY\n"
