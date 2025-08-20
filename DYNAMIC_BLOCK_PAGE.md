# Cloudflare Dynamic Block Page

A highly customizable block page built in Cloudflare Workers that provides enriched Access Deny reasoning to end users. This feature enhances the user experience when access is denied by showing detailed information about why the block occurred.

## Features

- **User Identity Display**: Shows user email, name, and groups
- **WARP Status Verification**: Displays if user has WARP enabled
- **Device Posture Checks**: Shows status for various security requirements:
  - CrowdStrike installation
  - Operating System requirements
  - Security Key usage
  - Device compliance status
- **Access Team Assignment**: Verifies correct team membership
- **Device Information**: Displays device OS, model, and other details
- **IDP Group Information**: Shows identity provider groups and special group identification
- **Access History**: Shows recent login failures (last 3 in 30 minutes)
- **Custom Theming**: Fully customizable colors and logo

## Prerequisites

1. **Cloudflare Account** with Zero Trust enabled
2. **API Token** with the following permissions:
   - Access: Audit Logs Read
   - Access: Device Posture Read
3. **Cloudflare Access Application** (Self-Hosted type) to protect the Worker
4. **Custom Domain** for hosting the block page

## Installation

### 1. Configure Environment Variables

Create a `.env` file with your configuration:

```bash
# Required
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here

# Optional
CLOUDFLARE_ORGANIZATION_ID=your_org_id_here
```

### 2. Update Configuration

Edit `wrangler.toml` to match your environment:

```toml
name = "cloudflare-dynamic-block-page"
main = "src/worker/index.ts"

[vars]
CORS_ORIGIN = "https://block.yourdomain.com"
ACCOUNT_ID = "your_account_id"
ORGANIZATION_ID = "your_org_id"
TARGET_GROUP = "restricted_users"  # Optional
DEBUG = "false"  # Set to "true" for initial setup

[[routes]]
pattern = "block.yourdomain.com/*"
zone_name = "yourdomain.com"
```

### 3. Deploy the Worker

```bash
# Install dependencies
npm install

# Deploy using the script
./scripts/deploy-block-page.sh

# Or manually
wrangler kv:namespace create IDENTITY_DYNAMIC_THEME_STORE
wrangler secret put BEARER_TOKEN
npm run build:worker
wrangler deploy
```

### 4. Create Access Application

1. Go to Cloudflare Zero Trust Dashboard
2. Navigate to Access > Applications
3. Create a new Self-Hosted application
4. Configure:
   - **Name**: Dynamic Block Page
   - **Domain**: `block.yourdomain.com`
   - **Session Duration**: 5 minutes (minimum)
   - **Policies**: Allow your organization's users

### 5. Configure Block Page in Access Applications

For each Access application where you want to use the custom block page:

1. Go to the application settings
2. Under "Block page", select "Custom"
3. Enter: `https://block.yourdomain.com/access-denied`

## Configuration

### Theme Customization

1. Enable debug mode in `wrangler.toml`:
   ```toml
   DEBUG = "true"
   ```

2. Redeploy the Worker:
   ```bash
   wrangler deploy
   ```

3. Visit `https://block.yourdomain.com/debug`

4. Upload your logo and select primary/secondary colors

5. Once configured, disable debug mode and redeploy

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BEARER_TOKEN` | Yes | Cloudflare API token (stored as secret) |
| `ACCOUNT_ID` | Yes | Your Cloudflare account ID |
| `CORS_ORIGIN` | Yes | Your block page domain for CORS |
| `ORGANIZATION_ID` | No | Zero Trust organization ID for verification |
| `TARGET_GROUP` | No | Special group name to flag |
| `DEBUG` | No | Enable debug/setup interface |

## API Endpoints

The Worker exposes several API endpoints for internal use:

### `/api/userdetails`
Returns combined user identity, device, and posture information.

### `/api/history`
Returns recent Access login failures via GraphQL.

### `/api/env`
Returns environment configuration for UI components.

### `/api/theme` (GET/POST)
Manages theme configuration (requires DEBUG mode).

### `/api/logo` (GET/POST)
Manages logo upload and retrieval (requires DEBUG mode).

## User Experience

When a user is blocked, they will see:

1. **Overview Section**
   - Email address and name
   - WARP connection status
   - Device information (OS, model)

2. **Posture Checks**
   - List of all device posture requirements
   - Pass/Fail status for each check
   - Detailed failure reasons

3. **Access History**
   - Recent failed login attempts
   - Timestamps and reasons for failures

4. **Action Items**
   - Clear instructions on what needs to be fixed
   - Contact information for IT support

## Troubleshooting

### Worker Not Deploying

- Ensure `wrangler` is installed: `npm install -g wrangler`
- Check API token permissions
- Verify account ID is correct

### Block Page Not Showing

- Verify Access application is configured correctly
- Check that the custom domain is properly routed
- Ensure Worker is deployed and running

### User Details Not Loading

- Check API token has correct permissions
- Verify CORS settings in `wrangler.toml`
- Check browser console for errors

### Theme Not Applying

- Ensure DEBUG mode was enabled during configuration
- Check KV namespace is properly configured
- Verify theme data was saved successfully

## Security Considerations

1. **API Token**: Store as a Worker secret, never in code
2. **Access Protection**: Always protect the Worker with an Access application
3. **CORS**: Configure CORS to only allow your domains
4. **Debug Mode**: Disable in production to prevent unauthorized configuration
5. **Sensitive Data**: The Worker has access to user and device information - ensure proper access controls

## Integration with Gateway Rules

The dynamic block page integrates seamlessly with your Cloudflare Gateway rules:

```typescript
// When creating a rule that blocks access
const rule = {
  name: "Block Social Media",
  action: "block",
  // Configure custom block page
  block_page_settings: {
    enabled: true,
    url: "https://block.yourdomain.com/access-denied",
    // Optional: Pass rule context
    context: {
      rule_name: "Social Media Block",
      category: "Productivity"
    }
  }
};
```

## Development

### Local Development

```bash
# Start local development server
npm run dev:worker

# View at http://localhost:8787
```

### Building for Production

```bash
# Build the Worker
npm run build:worker

# Deploy to production
npm run deploy:worker
```

### Testing

Test the block page by:
1. Creating a test Access application
2. Setting a deny policy for your test user
3. Attempting to access the protected resource
4. Verifying the block page displays correctly

## Support

For issues or questions:
1. Check the Worker logs in Cloudflare Dashboard
2. Review browser console for client-side errors
3. Verify all configuration steps were completed
4. Contact your Cloudflare support team if needed
