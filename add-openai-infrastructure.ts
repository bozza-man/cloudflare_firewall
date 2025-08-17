#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from './src/utils/config.js';

async function addOpenAIInfrastructure() {
  const accountId = config.cloudflare.accountId;
  const baseURL = config.cloudflare.baseUrl;
  
  // Create headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (config.cloudflare.apiToken) {
    headers['Authorization'] = `Bearer ${config.cloudflare.apiToken}`;
  } else if (config.cloudflare.globalKey && config.cloudflare.email) {
    headers['X-Auth-Email'] = config.cloudflare.email;
    headers['X-Auth-Key'] = config.cloudflare.globalKey;
  }
  
  const api = axios.create({ baseURL, headers });

  try {
    console.log('🤖 Adding comprehensive OpenAI infrastructure support...');
    
    // All required OpenAI domains
    const openaiDomains = [
      // Core OpenAI domains
      'openai.com',
      '*.openai.com',
      'auth0.openai.com',
      '*.auth.openai.com',
      'setup.auth.openai.com',
      'chat.openai.com',
      'tcr9i.chat.openai.com',
      'api.openai.com',
      'platform.openai.com',
      
      // ChatGPT domains
      'chatgpt.com',
      '*.chatgpt.com',
      
      // OpenAI content domains
      '*.oaiusercontent.com',
      'files.oaiusercontent.com',
      '*.oaistatic.com',
      
      // Mobile apps
      'ios.chat.openai.com',
      'android.chat.openai.com',
      'desktop.chat.openai.com',
      
      // Analytics and feature management
      'statsig.com',
      '*.statsig.com',
      'statsigapi.net',
      'events.statsigapi.net',
      'featuregates.org',
      '*.featuregates.org',
      'prodregistryv2.org',
      'featureassets.org',
      
      // Third-party services used by OpenAI
      'intercomcdn.com',
      '*.intercomcdn.com',
      'js.intercomcdn.com',
      '*.intercom.io',
      'js.stripe.com',
      'challenges.cloudflare.com',
      
      // Monitoring and logging
      'rum.browser-intake-datadoghq.com',
      'o33249.ingest.sentry.io',
      'o207216.ingest.sentry.io',
      
      // WorkOS (authentication/SSO)
      'setup.workos.com',
      'forwarder.workos.com',
      'workos.imgix.net',
      'cdn.workos.com',
      'images.workoscdn.com',
      
      // LaunchDarkly (feature flags)
      'events.launchdarkly.com',
      'clientstream.launchdarkly.com',
      'app.launchdarkly.com',
      
      // SendGrid (email services)
      '*.ct.sendgrid.net'
    ];
    
    console.log(`Adding ${openaiDomains.length} OpenAI infrastructure domains...`);

    // 1. Create DNS allow rule (highest priority)
    const dnsRule = {
      name: 'OpenAI Infrastructure: DNS Resolution',
      description: 'Allow DNS resolution for all OpenAI required domains including core services, analytics, CDN, and third-party integrations.',
      action: 'allow',
      enabled: true,
      precedence: 990, // Very high priority
      filters: ['dns'],
      traffic: openaiDomains.map(domain => {
        if (domain.startsWith('*.')) {
          return `dns.fqdn ~ "${domain.replace('*.', '*.')}"`;
        } else {
          return `dns.fqdn == "${domain}"`;
        }
      }).join(' or ')
    };

    console.log('Creating DNS allow rule...');
    const dnsResponse = await api.post(`/accounts/${accountId}/gateway/rules`, dnsRule);
    console.log(`✅ Created: ${dnsResponse.data.result.name} (precedence: ${dnsResponse.data.result.precedence})`);

    // 2. Create HTTP allow rule
    const httpRule = {
      name: 'OpenAI Infrastructure: HTTPS Access',
      description: 'Allow HTTPS access to all OpenAI infrastructure domains for complete functionality.',
      action: 'allow',
      enabled: true,
      precedence: 991,
      filters: ['http'],
      traffic: openaiDomains.map(domain => {
        if (domain.startsWith('*.')) {
          return `http.request.host matches "${domain.replace('*.', '.*\\.')}"`;
        } else {
          return `http.request.host == "${domain}"`;
        }
      }).join(' or ')
    };

    console.log('Creating HTTPS allow rule...');
    const httpResponse = await api.post(`/accounts/${accountId}/gateway/rules`, httpRule);
    console.log(`✅ Created: ${httpResponse.data.result.name} (precedence: ${httpResponse.data.result.precedence})`);

    // 3. Create TLS bypass for certificate-sensitive domains
    const tlsSensitiveDomains = [
      // Core OpenAI domains that likely use certificate pinning
      'openai.com',
      '*.openai.com',
      'chat.openai.com',
      'api.openai.com',
      'tcr9i.chat.openai.com',
      'chatgpt.com',
      '*.chatgpt.com',
      
      // Authentication domains
      'auth0.openai.com',
      '*.auth.openai.com',
      'setup.auth.openai.com',
      
      // Mobile apps
      'ios.chat.openai.com',
      'android.chat.openai.com',
      'desktop.chat.openai.com',
      
      // Payment processing (Stripe)
      'js.stripe.com',
      
      // WorkOS authentication
      'setup.workos.com',
      'forwarder.workos.com'
    ];

    const tlsBypassRule = {
      name: 'OpenAI Infrastructure: TLS Bypass (Certificate Pinning)',
      description: 'Bypass TLS inspection for OpenAI domains that use certificate pinning to prevent authentication and API errors.',
      action: 'off',
      enabled: true,
      precedence: 992, // After DNS/HTTP allows
      filters: ['http'],
      traffic: tlsSensitiveDomains.map(domain => {
        if (domain.startsWith('*.')) {
          return `http.conn.hostname matches "${domain.replace('*.', '.*\\.')}"`;
        } else {
          return `http.conn.hostname == "${domain}"`;
        }
      }).join(' or ')
    };

    console.log('Creating TLS bypass rule for certificate-sensitive domains...');
    const tlsResponse = await api.post(`/accounts/${accountId}/gateway/rules`, tlsBypassRule);
    console.log(`✅ Created: ${tlsResponse.data.result.name} (precedence: ${tlsResponse.data.result.precedence})`);

    console.log('\n🎉 OpenAI infrastructure setup completed!');
    console.log(`\n📊 Summary:`);
    console.log(`   • DNS Rule: ${openaiDomains.length} domains allowed for resolution`);
    console.log(`   • HTTPS Rule: ${openaiDomains.length} domains allowed for access`);
    console.log(`   • TLS Bypass: ${tlsSensitiveDomains.length} certificate-sensitive domains`);
    console.log(`\n✅ ChatGPT and OpenAI services should now work completely without issues!`);
    console.log(`\n⚠️  Note: Restart your browser to clear any cached errors.`);
    
  } catch (error) {
    console.error('❌ Error creating OpenAI infrastructure rules:', error);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

addOpenAIInfrastructure();
