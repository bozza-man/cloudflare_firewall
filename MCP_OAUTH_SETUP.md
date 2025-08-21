# Cloudflare MCP OAuth Authentication Setup

## Overview
The Cloudflare MCP (Model Context Protocol) servers require OAuth authentication to access real-time observability data, audit logs, and analytics features.

## Prerequisites
- Cloudflare account with appropriate permissions
- Access to Cloudflare MCP beta program (if required)
- Node.js and npm installed

## Setup Steps

### 1. Create a Cloudflare API Token

1. Visit: https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Select "Custom token" template
4. Configure the following permissions:
   - **Account permissions:**
     - Account:Read
     - Analytics:Read
     - Logs:Read
   - **Zone permissions:**
     - Zone:Read
     - Analytics:Read
     - DNS:Read
   - **Gateway permissions (if using Gateway):**
     - Gateway:Read
     - Gateway Audit Logs:Read

5. Add your account and zone resources
6. Click "Continue to summary" and then "Create Token"
7. **Copy the token immediately** - it won't be shown again!

### 2. Configure Environment Variables

Add the following to your `.env` file:

```bash
# Cloudflare API Authentication
CLOUDFLARE_API_TOKEN=your_api_token_here
CLOUDFLARE_ACCOUNT_ID=0b0ee2b5eaf1fb8a2612e40ab6488052
CLOUDFLARE_ZONE_ID=7249ad638510c628a7861d93535acbca

# Enable MCP features
ENABLE_MCP=true
ENABLE_MCP_OBSERVABILITY=true
ENABLE_MCP_AUDITLOGS=true
ENABLE_MCP_BROWSER=true
ENABLE_MCP_ANALYTICS=true
```

### 3. Run the Setup Script (Optional)

We've provided an automated setup script that will guide you through the process:

```bash
chmod +x setup-mcp-oauth.sh
./setup-mcp-oauth.sh
```

This script will:
- Prompt for your API token
- Update your `.env` file
- Configure the MCP servers with authentication
- Test the connection

### 4. Manual Configuration (Alternative)

If you prefer manual setup, update the `.mcp/config.json` file to include your API token in each server's environment:

```json
{
  "mcpServers": {
    "cloudflare-observability": {
      "command": "npx",
      "args": ["mcp-remote", "https://observability.mcp.cloudflare.com/sse"],
      "env": {
        "CLOUDFLARE_ACCOUNT_ID": "your_account_id",
        "CLOUDFLARE_API_TOKEN": "your_api_token"
      }
    }
    // ... other servers
  }
}
```

## Testing the Connection

After configuration, test the MCP connection:

```bash
# Test with a dry-run analysis
npm start -- rules analyze --with-mcp --dry-run

# Test observability features
npm start -- observability query --timeframe 1h

# Test audit logs
npm start -- audit-logs --days 1
```

## Troubleshooting

### Common Issues

1. **"Invalid argument type" error**
   - Ensure your API token is properly set in the environment
   - Check that the token has the required permissions

2. **"Connection refused" or timeout errors**
   - Verify you have access to the Cloudflare MCP beta
   - Check your network connectivity
   - Ensure the API token is valid and not expired

3. **"Unauthorized" errors**
   - Regenerate your API token with the correct permissions
   - Ensure the account ID and zone ID are correct

### Debug Mode

Enable debug logging to troubleshoot connection issues:

```bash
DEBUG=mcp:* npm start -- rules analyze --with-mcp
```

## MCP Server Endpoints

The following MCP servers are available:

- **Observability**: Real-time traffic analytics and metrics
- **Audit Logs**: Gateway rule change history and activity logs
- **Browser**: Automated testing of blocked sites
- **DNS Analytics**: DNS query patterns and statistics
- **Radar**: Threat intelligence and domain reputation data
- **AI Gateway**: AI-powered rule suggestions and optimization

## Security Notes

- **Never commit your API token** to version control
- Keep your `.env` file in `.gitignore`
- Rotate tokens regularly for security
- Use tokens with minimal required permissions

## Getting MCP Beta Access

If you receive errors about MCP access:

1. Visit: https://developers.cloudflare.com/mcp
2. Request beta access for your account
3. Wait for approval (usually 1-2 business days)

## Support

For issues or questions:
- Check the Cloudflare MCP documentation
- Review the error messages in the console
- Contact Cloudflare support if you have enterprise access

## Next Steps

Once authenticated, you can:
- Analyze rules with real-time traffic data
- View audit logs of rule changes
- Test blocked sites automatically
- Get AI-powered optimization suggestions
- Monitor DNS query patterns
- Access threat intelligence data
