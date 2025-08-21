#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Setting up custom domain and logging for Cloudflare Worker${NC}"

# Check if environment variables are set
if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo -e "${RED}Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set${NC}"
    exit 1
fi

ZONE_ID="0eb6f1b8e06c4e2a9e08b6c8c2c0e4e0" # Replace with your actual zone ID for bozza.au
WORKER_NAME="cloudflare-firewall-manager"
CUSTOM_DOMAIN="firewall.bozza.au"

# Step 1: Create custom route for the domain
echo -e "${YELLOW}Creating custom route for ${CUSTOM_DOMAIN}...${NC}"

curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{
    \"pattern\": \"${CUSTOM_DOMAIN}/*\",
    \"script\": \"${WORKER_NAME}\"
  }"

echo -e "\n${GREEN}Custom route created${NC}"

# Step 2: Create DNS record for the subdomain
echo -e "${YELLOW}Creating DNS record for ${CUSTOM_DOMAIN}...${NC}"

curl -X POST "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{
    \"type\": \"AAAA\",
    \"name\": \"firewall\",
    \"content\": \"100::\",
    \"ttl\": 1,
    \"proxied\": true
  }"

echo -e "\n${GREEN}DNS record created${NC}"

# Step 3: Enable Workers Logpush
echo -e "${YELLOW}Enabling Workers Logpush...${NC}"

# Create R2 bucket for logs if it doesn't exist
wrangler r2 bucket create worker-logs 2>/dev/null || echo "Logs bucket may already exist"

# Create Logpush job for Workers
curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/logpush/jobs" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{
    \"name\": \"firewall-worker-logs\",
    \"destination_conf\": \"r2://worker-logs?account-id=${CLOUDFLARE_ACCOUNT_ID}&bucket-path=firewall-worker\",
    \"dataset\": \"workers_trace_events\",
    \"enabled\": true,
    \"frequency\": \"high\",
    \"logpull_options\": \"fields=Event,EventTimestampMs,Outcome,Exceptions,Logs,ScriptName&timestamps=rfc3339\"
  }"

echo -e "\n${GREEN}Logpush enabled${NC}"

# Step 4: Enable real-time logs streaming
echo -e "${YELLOW}Enabling real-time log streaming...${NC}"

# This enables tail for real-time logs
wrangler tail --env production &
TAIL_PID=$!
sleep 5
kill $TAIL_PID 2>/dev/null

echo -e "${GREEN}Real-time logging configured${NC}"

# Step 5: Set up Analytics Engine
echo -e "${YELLOW}Setting up Analytics Engine...${NC}"

curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/analytics_engine/datasets" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{
    \"dataset\": \"firewall_metrics\",
    \"enabled\": true
  }"

echo -e "\n${GREEN}Analytics Engine configured${NC}"

# Step 6: Update Worker with new configuration
echo -e "${YELLOW}Deploying Worker with updated configuration...${NC}"

wrangler deploy -c wrangler.full.toml --env production

echo -e "\n${GREEN}Worker deployed with custom domain and logging${NC}"

# Step 7: Test the custom domain
echo -e "${YELLOW}Testing custom domain...${NC}"

sleep 5  # Wait for DNS propagation

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "https://${CUSTOM_DOMAIN}/health")

if [ "$RESPONSE" == "200" ]; then
    echo -e "${GREEN}✅ Custom domain is working! Visit https://${CUSTOM_DOMAIN}${NC}"
else
    echo -e "${YELLOW}⚠️  Custom domain may still be propagating. Please wait a few minutes and try again.${NC}"
fi

# Step 8: Display log access information
echo -e "\n${GREEN}=== Logging Information ===${NC}"
echo -e "Real-time logs: ${YELLOW}wrangler tail --env production${NC}"
echo -e "Historical logs: ${YELLOW}wrangler r2 object get worker-logs/<date>/<file>${NC}"
echo -e "Analytics: Visit ${YELLOW}https://dash.cloudflare.com/${CLOUDFLARE_ACCOUNT_ID}/workers/services/view/${WORKER_NAME}/production/analytics${NC}"

echo -e "\n${GREEN}Setup complete!${NC}"
