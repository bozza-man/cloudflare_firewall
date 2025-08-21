# GitHub Secrets Setup Guide

This guide explains how to configure GitHub repository secrets for automatic deployment of the Cloudflare Firewall Manager Worker.

## Required Secrets

You need to add the following secrets to your GitHub repository:

### 1. CLOUDFLARE_API_TOKEN
Your Cloudflare API token with the following permissions:
- Account:Cloudflare Workers Scripts:Edit
- Account:Worker Routes:Edit
- Account:Account Settings:Read
- Zone:DNS:Edit
- Zone:Workers Routes:Edit
- Account:D1:Edit
- Account:R2:Edit
- Account:KV Namespace:Edit
- Account:AI Gateway:Edit
- Account:Vectorize:Edit
- Account:Analytics:Edit

### 2. CLOUDFLARE_ACCOUNT_ID
Your Cloudflare account ID (found in the dashboard URL or account settings)
- Value: `0b0ee2b5eaf1fb8a2612e40ab6488052`

### 3. WORKER_URL
The deployed worker URL
- Value: `https://firewall.bozza.au`

### 4. SLACK_WEBHOOK_URL (Optional)
Slack webhook URL for deployment notifications
- Create a webhook at: https://api.slack.com/messaging/webhooks

## How to Add Secrets

### Via GitHub Web Interface:

1. Go to your repository: https://github.com/bozza-man/cloudflare_firewall
2. Click on **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret with its name and value
6. Click **Add secret**

### Via GitHub CLI:

```bash
# Install GitHub CLI if not already installed
# brew install gh (macOS)
# or visit: https://cli.github.com/

# Authenticate
gh auth login

# Add secrets
gh secret set CLOUDFLARE_API_TOKEN --body "your-api-token"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "0b0ee2b5eaf1fb8a2612e40ab6488052"
gh secret set WORKER_URL --body "https://firewall.bozza.au"
gh secret set SLACK_WEBHOOK_URL --body "your-slack-webhook-url" # Optional
```

## Creating a Cloudflare API Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Use **Custom token** template
4. Configure permissions:

```yaml
Account Permissions:
  - Cloudflare Workers Scripts: Edit
  - Worker Routes: Edit
  - Account Settings: Read
  - D1: Edit
  - R2: Edit
  - KV Namespace: Edit
  - AI Gateway: Edit
  - Vectorize: Edit
  - Analytics: Edit
  - Logs: Edit

Zone Permissions (for bozza.au):
  - DNS: Edit
  - Workers Routes: Edit
  - Zone Settings: Read
```

5. Add Account Resources:
   - Include: Your Account (0b0ee2b5eaf1fb8a2612e40ab6488052)

6. Add Zone Resources:
   - Include: Specific zone → bozza.au

7. Click **Continue to summary**
8. Click **Create Token**
9. Copy the token and save it securely

## Verifying Setup

After adding all secrets, you can verify the setup:

1. Make a small change to any file
2. Commit and push to the `main` branch
3. Go to the **Actions** tab in your repository
4. Watch the workflow run
5. Check for green checkmarks on all jobs

## Deployment Workflow

The GitHub Actions workflow will:

1. **On push to main branch:**
   - Run tests
   - Build the Worker
   - Deploy to production at firewall.bozza.au
   - Set up Cloudflare services (D1, R2, KV, etc.)
   - Enable logging and monitoring

2. **On push to develop branch:**
   - Run tests
   - Build the Worker
   - Deploy to staging environment

3. **On pull requests:**
   - Run tests and linting
   - Build verification (no deployment)

## Manual Deployment

If you need to deploy manually:

```bash
# Deploy to production
wrangler deploy -c wrangler.full.toml --env production

# Deploy to staging
wrangler deploy -c wrangler.full.toml --env staging

# View logs
wrangler tail --env production
```

## Troubleshooting

### Common Issues:

1. **Authentication failed:**
   - Verify API token has correct permissions
   - Check token hasn't expired
   - Ensure account ID is correct

2. **Deployment failed:**
   - Check Worker name doesn't conflict
   - Verify zone ID for custom domain
   - Ensure R2/KV namespaces exist

3. **Custom domain not working:**
   - DNS may take up to 5 minutes to propagate
   - Verify DNS record is proxied through Cloudflare
   - Check Worker route is correctly configured

## Security Notes

- Never commit secrets to the repository
- Rotate API tokens regularly
- Use environment-specific tokens when possible
- Enable 2FA on your Cloudflare account
- Review deployment logs regularly

## Support

For issues or questions:
- Check GitHub Actions logs for detailed error messages
- Review Cloudflare dashboard for Worker status
- Use `wrangler tail` for real-time debugging
