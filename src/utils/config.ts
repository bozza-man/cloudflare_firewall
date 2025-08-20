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
  },
  osint: {
    // Free services (no API key required)
    enableFreeServices: process.env.OSINT_ENABLE_FREE_SERVICES !== 'false',
    
    // Premium services (require API keys)
    whoisXmlApiKey: process.env.WHOISXML_API_KEY || undefined,
    securityTrailsApiKey: process.env.SECURITYTRAILS_API_KEY || undefined,
    clearbitApiKey: process.env.CLEARBIT_API_KEY || undefined,
    hunterApiKey: process.env.HUNTER_API_KEY || undefined,
    sslmateApiKey: process.env.SSLMATE_API_KEY || undefined,
    
    // Rate limiting and performance settings
    maxConcurrentRequests: parseInt(process.env.OSINT_MAX_CONCURRENT || '3'),
    rateLimitMs: parseInt(process.env.OSINT_RATE_LIMIT_MS || '1000'),
    requestTimeoutMs: parseInt(process.env.OSINT_TIMEOUT_MS || '10000'),
    dnsTimeoutMs: parseInt(process.env.OSINT_DNS_TIMEOUT_MS || '5000'),
    
    // Feature toggles
    enableWhoisLookup: process.env.OSINT_ENABLE_WHOIS !== 'false',
    enableDnsLookup: process.env.OSINT_ENABLE_DNS !== 'false',
    enableGeoLocation: process.env.OSINT_ENABLE_GEO !== 'false',
    enableCertificateTransparency: process.env.OSINT_ENABLE_CT !== 'false',
    enableSubdomainEnum: process.env.OSINT_ENABLE_SUBDOMAINS !== 'false'
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
