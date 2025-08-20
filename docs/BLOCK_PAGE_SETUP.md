# Setting Up Organization-Wide Block Page in Cloudflare Zero Trust

## Overview
This guide explains how to configure your Cloudflare Zero Trust organization to use a custom block page Worker for all blocked requests.

## Prerequisites
- Cloudflare Zero Trust account with Gateway enabled
- Custom domain configured in Cloudflare
- Block page Worker deployed (see deployment section)

## Step 1: Deploy the Block Page Worker

First, deploy your custom block page Worker:

```bash
# Build the Worker
npm run build:worker

# Deploy using the CLI (make sure Worker is configured)
npm start -- block-page deploy --domain block.bozza.au
```

Or deploy manually using Wrangler:

```bash
# Set your API token as a secret
npx wrangler secret put BEARER_TOKEN

# Deploy the Worker
npx wrangler deploy
```

## Step 2: Configure Organization-Wide Block Page

### Via Cloudflare Dashboard (Recommended)

1. Log in to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Settings** → **General**
3. Scroll to **Block page** section
4. Click **Customize**
5. Enter your custom block page URL:
   ```
   https://block.bozza.au/access-denied
   ```
6. Configure additional settings:
   - **Support Email**: support@bozza.au
   - **Footer Text**: "If you believe this is a mistake, please contact IT support."
   - **Logo**: Upload your organization logo
7. Click **Save**

### Via API (When Available)

```bash
# Use the CLI command (when API endpoints are accessible)
npm start -- block-page set-org \
  --url "https://block.bozza.au/access-denied" \
  --email "support@bozza.au" \
  --footer "Contact IT support for assistance"
```

## Step 3: Configure Gateway Policies

### HTTP Policies
1. Go to **Gateway** → **Firewall Policies** → **HTTP**
2. For each blocking rule, ensure the action is set to **Block**
3. The block page will automatically be shown for blocked requests

### DNS Policies
1. Go to **Gateway** → **Firewall Policies** → **DNS**
2. DNS blocks will show a connection error (not the block page)
3. Consider using HTTP policies for domains where you want the block page shown

### Network Policies
1. Go to **Gateway** → **Firewall Policies** → **Network**
2. Network blocks happen at L4 and won't show the block page
3. Users will see a connection timeout or reset

## Step 4: Test the Block Page

### Quick Test
1. Visit a site that should be blocked by your policies
2. You should see your custom block page at:
   ```
   https://block.bozza.au/access-denied
   ```

### Test Different Scenarios
```bash
# Test with curl (should redirect to block page)
curl -I https://blocked-site.com

# Check block page directly
curl https://block.bozza.au/access-denied
```

## Step 5: Customize the Block Page

### Via Debug Interface
If debug mode is enabled, visit:
```
https://block.bozza.au/debug
```

Here you can:
- Upload a custom logo
- Configure theme colors
- Set custom messages
- Test different user scenarios

### Via Worker Code
Edit `src/worker/index.ts` to customize:
- HTML templates
- Dynamic content based on user/rule
- Integration with external services
- Custom styling

## Troubleshooting

### Block Page Not Showing
1. Verify Worker is deployed and accessible
2. Check that the domain is properly configured
3. Ensure Zero Trust settings point to correct URL
4. Verify the rule action is "Block" (not "Isolate" or others)

### Wrong Content Displayed
1. Check Worker logs: `npx wrangler tail`
2. Verify KV namespace is configured
3. Check CORS settings in Worker configuration

### DNS Blocks Not Showing Page
- DNS blocks happen at resolution level
- Users see NXDOMAIN or connection error
- Consider using HTTP rules for important blocks

## Block Page Features

### Dynamic Content
The block page can show:
- Which rule blocked the request
- User identity information
- Timestamp of the block
- Custom message per rule
- Support contact information

### URL Parameters
The block page receives context via URL parameters:
- `rule_id`: ID of the blocking rule
- `rule_name`: Name of the blocking rule
- `user_email`: Email of blocked user
- `reason`: Reason for the block
- `url`: Originally requested URL

### Example Block Page URL
```
https://block.bozza.au/access-denied?
  rule_name=Block+Social+Media&
  user_email=user@example.com&
  reason=Policy+violation&
  timestamp=2025-08-19T19:44:09.495Z
```

## Best Practices

1. **Clear Messaging**: Provide clear reasons why access was blocked
2. **Support Information**: Always include how to request access
3. **Branding**: Use organization branding for consistency
4. **Logging**: Log block page views for analytics
5. **Mobile Friendly**: Ensure the page works on all devices
6. **Fast Loading**: Keep the page lightweight
7. **Fallback**: Have a simple HTML fallback if Worker fails

## API Endpoints (Reference)

While not all endpoints are currently accessible, here are the relevant API endpoints:

```bash
# Organization settings (when available)
GET /accounts/{account_id}/gateway
PUT /accounts/{account_id}/gateway

# Access organization settings
GET /accounts/{account_id}/access/organizations
PUT /accounts/{account_id}/access/organizations

# Gateway configuration
GET /accounts/{account_id}/gateway/configuration
PUT /accounts/{account_id}/gateway/configuration
```

## Support

For issues with the block page:
1. Check Worker logs: `npx wrangler tail`
2. Review Zero Trust audit logs
3. Test with different user accounts
4. Contact Cloudflare support if needed
