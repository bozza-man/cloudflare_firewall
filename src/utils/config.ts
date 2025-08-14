import dotenv from 'dotenv';

dotenv.config();

export const config = {
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN || '',
    globalKey: process.env.CLOUDFLARE_GLOBAL_KEY || '',
    email: process.env.CLOUDFLARE_EMAIL || '',
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    zoneId: process.env.CLOUDFLARE_ZONE_ID || '',
    baseUrl: 'https://api.cloudflare.com/client/v4'
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || ''
  }
};

export function validateConfig(): void {
  const errors: string[] = [];

  // Check for either API Token OR Global Key + Email
  const hasApiToken = !!config.cloudflare.apiToken;
  const hasGlobalKey = !!(config.cloudflare.globalKey && config.cloudflare.email);
  
  if (!hasApiToken && !hasGlobalKey) {
    errors.push('Either CLOUDFLARE_API_TOKEN or (CLOUDFLARE_GLOBAL_KEY + CLOUDFLARE_EMAIL) is required');
  }

  if (!config.cloudflare.accountId) {
    errors.push('CLOUDFLARE_ACCOUNT_ID is required for Gateway operations');
  }

  if (!config.cloudflare.zoneId) {
    errors.push('CLOUDFLARE_ZONE_ID is required for Firewall operations');
  }

  if (!config.anthropic.apiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(error => console.error(`  - ${error}`));
    console.error('\nPlease copy .env.example to .env and fill in the required values.');
    process.exit(1);
  }
}
