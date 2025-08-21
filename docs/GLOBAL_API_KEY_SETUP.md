# Global API Key Setup Guide

This guide explains how to use your Cloudflare Global API Key to create a properly permissioned API token for the Cloudflare Firewall Manager.

## Why Use Global API Key?

The Global API Key has full access to your Cloudflare account and can be used to create API tokens with any permissions. This is necessary when:
- Your current API token lacks permissions to manage Worker routes
- You need to configure DNS records and zone settings
- You want to create a new token with specific permissions

## Getting Your Global API Key

1. **Log in to Cloudflare Dashboard**
   - Go to: https://dash.cloudflare.com

2. **Navigate to API Tokens**
   - Click on your profile icon (top right)
   - Select **My Profile**
   - Click on **API Tokens** tab

3. **Find Global API Key**
   - Scroll down to **API Keys** section
   - Click **View** next to Global API Key
   - Enter your password to reveal the key
   - Copy the key (it looks like a long string of random characters)

## Using the Token Creation Script

### Option 1: Interactive Mode

Run the script without environment variables:

```bash
./scripts/create-full-permission-token.sh
```

You'll be prompted to enter:
- Your Cloudflare email address
- Your Global API Key

### Option 2: Environment Variables

Set the credentials as environment variables:

```bash
export CLOUDFLARE_EMAIL="your-email@example.com"
export CLOUDFLARE_GLOBAL_KEY="your-global-api-key-here"

./scripts/create-full-permission-token.sh
```

## What the Script Does

1. **Retrieves Zone Information**
   - Gets the zone ID for bozza.au

2. **Creates API Token**
   - Creates a new API token with all necessary permissions
   - Includes Workers, DNS, KV, D1, R2, and AI permissions

3. **Verifies Token**
   - Tests the newly created token

4. **Updates Environment**
   - Saves token to `.env.production`
   - Updates GitHub repository secret
   - Exports token for current session

5. **Deploys Worker**
   - Deploys the Worker using the new token

6. **Configures Custom Domain**
   - Creates DNS record for firewall.bozza.au
   - Sets up Worker route

## Manual Token Creation (Alternative)

If you prefer to create the token manually:

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Select **Custom token** template
4. Configure:
   - **Token name**: Cloudflare Firewall Manager
   - **Permissions**:
     ```
     Account - Workers Scripts:Edit
     Account - Workers KV Storage:Edit
     Account - Workers R2 Storage:Edit
     Account - D1:Edit
     Account - AI Gateway:Edit
     Zone - Zone:Read
     Zone - DNS:Edit
     Zone - Workers Routes:Edit
     ```
   - **Account Resources**: Include → 0b0ee2b5eaf1fb8a2612e40ab6488052
   - **Zone Resources**: Include → Specific zone → bozza.au

5. Click **Continue to summary**
6. Click **Create Token**
7. Copy the token value

## Updating GitHub Secret

After creating the token, update the GitHub repository secret:

```bash
# Using GitHub CLI
gh secret set CLOUDFLARE_API_TOKEN \
  --repo bozza-man/cloudflare_firewall \
  --body "your-new-token-here"
```

Or manually:
1. Go to: https://github.com/bozza-man/cloudflare_firewall/settings/secrets/actions
2. Click on `CLOUDFLARE_API_TOKEN`
3. Click **Update**
4. Paste the new token
5. Click **Update secret**

## Security Best Practices

⚠️ **IMPORTANT SECURITY NOTES:**

1. **Never commit your Global API Key to Git**
   - It has full access to your account
   - Always use API tokens for applications

2. **Delete Global API Key from environment after use**
   ```bash
   unset CLOUDFLARE_GLOBAL_KEY
   unset CLOUDFLARE_EMAIL
   ```

3. **Use API Tokens instead of Global Key**
   - API tokens have limited, specific permissions
   - Can be easily revoked without affecting other services
   - Have expiration dates

4. **Rotate tokens regularly**
   - Set expiration dates on tokens
   - Revoke unused tokens
   - Monitor token usage in the dashboard

## Troubleshooting

### Permission Errors

If you get permission errors when deploying:
```
Authentication error [code: 10000]
```

This means the token lacks necessary permissions. Run the script again to create a new token with proper permissions.

### Zone Not Found

If the script can't find your zone:
- Verify you own the domain bozza.au
- Check it's added to your Cloudflare account
- Ensure the Global API Key is correct

### Token Creation Failed

If token creation fails:
- Check your Global API Key is valid
- Verify your email is correct
- Ensure you have permission to create tokens
- Try the manual creation method

## Verifying Setup

After running the script, verify everything works:

1. **Check Worker deployment**
   ```bash
   curl https://cloudflare-firewall-manager.bruteforce.workers.dev/health
   ```

2. **Check custom domain (after DNS propagation)**
   ```bash
   curl https://firewall.bozza.au/health
   ```

3. **View logs**
   ```bash
   npx wrangler tail --env production
   ```

## Support

For issues or questions:
- Check Cloudflare status: https://www.cloudflarestatus.com/
- Review API documentation: https://developers.cloudflare.com/api/
- Check Worker logs for errors
