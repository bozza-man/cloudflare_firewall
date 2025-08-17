# Cloudflare API Token Setup Guide for Gateway Lists

## Why We Need a New Token

Your current API token appears to have limited permissions that don't include Gateway list management. To successfully create and manage Gateway lists programmatically, we need a token with the correct permissions.

## Steps to Create a New API Token

### 1. Go to Cloudflare Dashboard
- Visit: https://dash.cloudflare.com/profile/api-tokens
- Click "Create Token"

### 2. Use Custom Token Template
- Click "Get started" under "Custom token"

### 3. Configure Token Permissions

Add these permissions to your token:

#### Account Permissions:
- **Cloudflare Tunnel:Read** (if you use tunnels)
- **Zone Settings:Read** (for basic zone access)

#### Zone Permissions (if applicable):
- **Zone:Read** (for any zones you manage)

#### Account-Level Permissions (CRITICAL):
- **Account:Read** 
- **Access:Edit** (this covers Gateway rules)
- **Access:Read**

#### Specific Gateway Permissions:
If available, look for these specific permissions:
- **Gateway:Edit** 
- **Gateway:Read**
- **Lists:Edit** (Critical for list management)
- **Lists:Read**

### 4. Account Resources
- Select your account: `bruteforcegroup` (or your account name)

### 5. Zone Resources (if needed)
- Select "All zones" or specific zones you need

### 6. Client IP Address Filtering (Optional)
- Leave blank for access from anywhere
- Or specify your current IP for additional security

### 7. TTL (Time to Live)
- Set to your preference (e.g., 1 year)

## After Creating the Token

### 1. Test the New Token
Save the token and update your `.env` file:

```bash
# Update your .env file
CLOUDFLARE_API_TOKEN=your_new_token_here
CLOUDFLARE_ACCOUNT_ID=0b0ee2b5eaf1fb8a2612e40ab6488052
```

### 2. Test Token Permissions
Run this command to test the new token:

```bash
node test-api-permissions.js
```

## Common Issues and Solutions

### Permission Denied (403)
- Your token doesn't have the right permissions
- Make sure you selected **Access:Edit** and **Lists:Edit**
- Verify the account ID is correct

### Method Not Allowed (405) 
- The API endpoint might not support the HTTP method
- Gateway lists API might have different endpoints than WAF lists

### Rate Limiting (429)
- Wait a few minutes and try again
- Our scripts include delays to prevent this

## Alternative Approach: Manual List Management

If API access continues to fail, you can:

1. **Manually create lists** in the Cloudflare Dashboard:
   - Go to: Zero Trust → Settings → Lists
   - Create lists with the names from our script
   - Manually add domains from our predefined lists

2. **Use our rule conversion script** to update rules to reference the lists:
   - The script will help convert inline hosts to list references
   - Much easier maintenance once lists are in place

## Security Note

- Store your API token securely
- Don't commit it to version control
- Consider using environment variables or secure key management
- Rotate tokens periodically for security
