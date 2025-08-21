# Cloudflare Worker Deployment Guide

## Overview

This document describes how to deploy the Cloudflare Worker to firewall.bozza.au. The worker provides a dynamic block page and API endpoints for the Cloudflare Gateway firewall management system.

## Architecture

The worker is deployed to:
- **Production**: https://firewall.bozza.au
- **Staging**: https://firewall-staging.bozza.au (optional)

## Automatic Deployment (CI/CD)

### GitHub Actions Workflow

The project uses GitHub Actions for automatic deployment. The workflow is triggered on:

1. **Push to main branch** - Automatically deploys to production
2. **Pull requests** - Runs tests only (no deployment)
3. **Manual trigger** - Can deploy to staging or production

### Required GitHub Secrets

Before automatic deployment works, you must configure the following secrets in your GitHub repository:

1. Go to your repository on GitHub
2. Navigate to Settings → Secrets and variables → Actions
3. Add the following secrets:

| Secret Name | Description | How to Get |
|------------|-------------|------------|
| `CLOUDFLARE_API_TOKEN` | API token for Cloudflare Workers deployment | [Create at Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens) with "Edit Workers" permission |
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID | `0b0ee2b5eaf1fb8a2612e40ab6488052` (already configured) |
| `WORKER_BEARER_TOKEN` | Bearer token for API authentication | Generate a secure token using `openssl rand -hex 32` |

### Creating the Cloudflare API Token

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to My Profile → API Tokens
3. Click "Create Token"
4. Use the "Custom token" template with these permissions:
   - Account: Cloudflare Workers Scripts:Edit
   - Zone: Zone:Read (for bozza.au)
   - Zone: Workers Routes:Edit (for bozza.au)
5. Add Account resources: Include → Your account
6. Add Zone resources: Include → Specific zone → bozza.au
7. Click "Continue to summary" and "Create Token"
8. Copy the token and add it as `CLOUDFLARE_API_TOKEN` in GitHub Secrets

## Manual Deployment

### Prerequisites

1. Node.js 18.x or 20.x installed
2. npm or yarn package manager
3. Cloudflare account with Workers enabled
4. Access to the bozza.au zone

### Setup

1. Clone the repository:
```bash
git clone https://github.com/your-username/cloudflare_firewall.git
cd cloudflare_firewall
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. Authenticate with Cloudflare:
```bash
npx wrangler login
```

### Deploy Commands

```bash
# Deploy to production (firewall.bozza.au)
npm run deploy:worker

# Deploy with custom configuration
npx wrangler deploy

# Deploy to staging (requires wrangler.staging.toml)
npx wrangler deploy -c wrangler.staging.toml

# View real-time logs
npm run tail:worker
```

## Worker Configuration

### Environment Variables

The worker uses the following environment variables (configured in `wrangler.toml`):

| Variable | Description | Default |
|----------|-------------|---------|
| `CORS_ORIGIN` | Allowed CORS origin | `https://firewall.bozza.au` |
| `ACCOUNT_ID` | Cloudflare account ID | `0b0ee2b5eaf1fb8a2612e40ab6488052` |
| `ORGANIZATION_ID` | Zero Trust organization ID | (optional) |
| `TARGET_GROUP` | Group for special attention | (optional) |
| `DEBUG` | Enable debug endpoints | `false` |

### Secrets

Secrets must be set using Wrangler CLI:

```bash
# Set the bearer token for API authentication
echo "your-secret-token" | npx wrangler secret put BEARER_TOKEN
```

### KV Namespace

The worker uses a KV namespace for storing themes and logos:

- **Binding**: `IDENTITY_DYNAMIC_THEME_STORE`
- **ID**: `874ed0b066ac4df3b2200c888ff3b86b`

If you need to create a new KV namespace:
```bash
npx wrangler kv:namespace create "IDENTITY_DYNAMIC_THEME_STORE"
```

## API Endpoints

Once deployed, the worker provides these endpoints:

- `GET /api/userdetails` - Get user details from Access
- `GET /api/history` - Get access history
- `GET /api/env` - Get environment configuration
- `GET /api/theme` - Get custom theme
- `POST /api/theme` - Update theme (requires DEBUG=true)
- `GET /api/logo` - Get custom logo
- `POST /api/logo` - Upload logo (requires DEBUG=true)
- `GET /access-denied` - Main block page
- `GET /information` - Information page
- `GET /debug` - Debug interface (requires DEBUG=true)

## DNS Configuration

Ensure the following DNS record exists in Cloudflare:

```
Type: CNAME
Name: firewall
Target: firewall-bozza-au.workers.dev
Proxy: ✓ (Orange cloud - proxied)
```

Or if using A record:
```
Type: A
Name: firewall
IPv4: 192.0.2.1 (dummy IP for Workers)
Proxy: ✓ (Orange cloud - proxied)
```

## Monitoring

### View Logs

```bash
# Real-time logs
npm run tail:worker

# Or using wrangler directly
npx wrangler tail firewall-bozza-au
```

### Cloudflare Dashboard

Monitor your worker at:
- [Workers Dashboard](https://dash.cloudflare.com/?to=/:account/workers)
- [Analytics](https://dash.cloudflare.com/?to=/:account/workers/services/view/firewall-bozza-au/production)

## Troubleshooting

### Common Issues

1. **Deployment fails with authentication error**
   - Ensure `CLOUDFLARE_API_TOKEN` is set correctly in GitHub Secrets
   - Verify the token has the correct permissions

2. **Worker not responding at firewall.bozza.au**
   - Check DNS records are configured correctly
   - Verify the route is set in wrangler.toml
   - Check worker status in Cloudflare Dashboard

3. **KV namespace errors**
   - Ensure the KV namespace ID matches in wrangler.toml
   - Verify the namespace exists in your account

4. **CORS errors**
   - Update `CORS_ORIGIN` in wrangler.toml to match your domain

### Debug Mode

To enable debug mode for troubleshooting:

1. Update `wrangler.toml`:
```toml
DEBUG = "true"
```

2. Redeploy the worker
3. Access debug interface at https://firewall.bozza.au/debug

## Rollback

If you need to rollback a deployment:

1. **Via GitHub**: Revert the commit and push to main
2. **Via Cloudflare Dashboard**: 
   - Go to Workers → firewall-bozza-au → Deployments
   - Select a previous deployment
   - Click "Rollback"

## Security Considerations

1. **Never commit secrets** to the repository
2. **Use environment-specific tokens** for staging vs production
3. **Rotate the BEARER_TOKEN** regularly
4. **Monitor access logs** for suspicious activity
5. **Keep DEBUG=false** in production

## Support

For issues or questions:
1. Check the [GitHub Issues](https://github.com/your-username/cloudflare_firewall/issues)
2. Review worker logs using `npm run tail:worker`
3. Contact the team via internal channels

## Related Documentation

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Project README](../README.md)
- [WARP Guidelines](../WARP.md)
