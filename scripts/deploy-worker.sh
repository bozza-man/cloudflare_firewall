#!/bin/bash

# Cloudflare Worker Deployment Script for firewall.bozza.au
# This script handles the deployment of the worker with proper error handling

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Cloudflare Worker Deployment Script${NC}"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Parse command line arguments
ENVIRONMENT="production"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --staging)
            ENVIRONMENT="staging"
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --staging    Deploy to staging environment"
            echo "  --dry-run    Perform a dry run without actual deployment"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# Set configuration file based on environment
if [ "$ENVIRONMENT" = "staging" ]; then
    CONFIG_FILE="wrangler.staging.toml"
    DOMAIN="firewall-staging.bozza.au"
    
    # Create staging config if it doesn't exist
    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "${YELLOW}Creating staging configuration...${NC}"
        cp wrangler.production.toml $CONFIG_FILE
        # Update for staging
        sed -i.bak 's/firewall\.bozza\.au/firewall-staging.bozza.au/g' $CONFIG_FILE
        sed -i.bak 's/ENVIRONMENT = "production"/ENVIRONMENT = "staging"/g' $CONFIG_FILE
        sed -i.bak 's/DEBUG = "false"/DEBUG = "true"/g' $CONFIG_FILE
        sed -i.bak 's/name = "cloudflare-firewall-manager"/name = "cloudflare-firewall-manager-staging"/g' $CONFIG_FILE
        rm ${CONFIG_FILE}.bak
    fi
else
    CONFIG_FILE="wrangler.production.toml"
    DOMAIN="firewall.bozza.au"
fi

echo -e "${YELLOW}Environment: $ENVIRONMENT${NC}"
echo -e "${YELLOW}Config file: $CONFIG_FILE${NC}"
echo -e "${YELLOW}Domain: https://$DOMAIN${NC}"
echo ""

# Check for required environment variables
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Warning: .env file not found. Using environment variables.${NC}"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm ci
fi

# Run TypeScript type checking (without emitting)
echo -e "${YELLOW}🔍 Checking TypeScript types...${NC}"
npx tsc --project tsconfig.worker.json --noEmit || {
    echo -e "${YELLOW}⚠️  TypeScript type errors detected. Continuing with deployment...${NC}"
}

# Deploy command
DEPLOY_CMD="npx wrangler deploy --config $CONFIG_FILE"

if [ "$DRY_RUN" = true ]; then
    DEPLOY_CMD="$DEPLOY_CMD --dry-run"
    echo -e "${YELLOW}🔍 Running dry run...${NC}"
else
    echo -e "${GREEN}🚀 Deploying to $ENVIRONMENT...${NC}"
fi

# Execute deployment
echo "Running: $DEPLOY_CMD"
$DEPLOY_CMD

if [ $? -eq 0 ]; then
    if [ "$DRY_RUN" = true ]; then
        echo -e "${GREEN}✅ Dry run completed successfully!${NC}"
    else
        echo -e "${GREEN}✅ Deployment successful!${NC}"
        echo ""
        echo -e "${GREEN}Worker deployed to: https://$DOMAIN${NC}"
        
        # Test the deployment
        echo ""
        echo -e "${YELLOW}🔍 Testing deployment...${NC}"
        
        # Wait a moment for the deployment to propagate
        sleep 3
        
        # Test the API endpoint
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/env")
        
        if [ "$HTTP_STATUS" = "200" ]; then
            echo -e "${GREEN}✅ Worker is responding correctly (HTTP $HTTP_STATUS)${NC}"
        else
            echo -e "${YELLOW}⚠️  Worker returned HTTP $HTTP_STATUS (expected 200)${NC}"
            echo -e "${YELLOW}   This might be normal if authentication is required.${NC}"
        fi
        
        echo ""
        echo -e "${GREEN}📝 Next steps:${NC}"
        echo "  1. Set secrets using: wrangler secret put BEARER_TOKEN --config $CONFIG_FILE"
        echo "  2. Monitor logs: npx wrangler tail --config $CONFIG_FILE"
        echo "  3. View analytics: https://dash.cloudflare.com/?to=/:account/workers"
    fi
else
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo -e "${YELLOW}Check the logs above for details.${NC}"
    exit 1
fi
