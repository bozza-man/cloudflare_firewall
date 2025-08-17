#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from './src/utils/config.js';

async function createOptimizedGatewayLists() {
  const accountId = config.cloudflare.accountId;
  const baseURL = config.cloudflare.baseUrl;
  
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
    console.log('🎯 Creating Optimized Gateway Lists for Rule Consolidation\n');
    
    // 1. Create Certificate Infrastructure List
    console.log('🔐 Creating Certificate Infrastructure List...');
    
    const certDomains = [
      // OCSP Responders
      'ocsp.digicert.com',
      'ocsp.sectigo.com',
      'ocsp.comodoca.com',
      'ocsp.globalsign.com',
      'ocsp.entrust.net',
      'ocsp.apple.com',
      'ocsp.godaddy.com',
      'ocsp.thawte.com',
      'ocsp.verisign.com',
      'ocsp.symantec.com',
      'ocsp2.globalsign.com',
      'ocsp.identrust.com',
      'ocsp.usertrust.com',
      'ocsp.letsencrypt.org',
      'r3.o.lencr.org',
      'r4.o.lencr.org',
      'e1.o.lencr.org',
      'e2.o.lencr.org',
      'x1.o.lencr.org',
      'x2.o.lencr.org',
      
      // CRL Services
      'crl.digicert.com',
      'crl.sectigo.com',
      'crl.comodoca.com',
      'crl.globalsign.com',
      'crl.entrust.net',
      'crl.apple.com',
      'crl.godaddy.com',
      'crl.thawte.com',
      'crl.verisign.com',
      'crl.symantec.com',
      'crl3.digicert.com',
      'crl4.digicert.com',
      'crl.identrust.com',
      'crl.usertrust.com',
      'crl.letsencrypt.org',
      
      // Certificate Transparency
      'crt.sh',
      'ct.googleapis.com',
      'ct.cloudflare.com',
      'ct1.digicert-ct.com',
      'ct2.digicert-ct.com',
      
      // Microsoft Certificate Services
      'ocsp.msocsp.com',
      'crl.microsoft.com',
      'mscrl.microsoft.com',
      'ocsp.rootca.microsoft.com',
      
      // Google Certificate Services
      'ocsp.pki.goog',
      'crl.pki.goog',
      'pki.goog',
      
      // Additional CA Services
      'cacerts.digicert.com',
      'secure.globalsign.com',
      'apps.identrust.com',
      'letsencrypt.org',
      'isrg.trustid.ocsp.identrust.com',
      'ocsp.int-x3.letsencrypt.org',
      'status.rapidssl.com',
      'ocsp.rapidssl.com',
      'crl.rapidssl.com',
      'ocsp.ssl.com',
      'crl.ssl.com'
    ];

    const certListPayload = {
      name: 'Certificate Infrastructure Domains',
      description: 'Comprehensive list of OCSP responders, CRL servers, and certificate transparency services for SSL/TLS validation.',
      type: 'DOMAIN',
      items: certDomains.map(domain => ({ value: domain }))
    };

    const certListResponse = await api.post(`/accounts/${accountId}/gateway/lists`, certListPayload);
    const certListId = certListResponse.data.result.id;
    console.log(`✅ Created Certificate Infrastructure List: ${certListId} (${certDomains.length} domains)`);

    // 2. Create OpenAI Infrastructure List
    console.log('\n🤖 Creating OpenAI Infrastructure List...');
    
    const openaiDomains = [
      // Core OpenAI domains
      'openai.com',
      'chat.openai.com',
      'api.openai.com',
      'platform.openai.com',
      'auth0.openai.com',
      'setup.auth.openai.com',
      'tcr9i.chat.openai.com',
      'chatgpt.com',
      'files.oaiusercontent.com',
      
      // Mobile apps
      'ios.chat.openai.com',
      'android.chat.openai.com',
      'desktop.chat.openai.com',
      
      // Analytics and feature management
      'statsigapi.net',
      'events.statsigapi.net',
      'featuregates.org',
      'prodregistryv2.org',
      'featureassets.org',
      
      // Third-party services
      'intercomcdn.com',
      'js.intercomcdn.com',
      'js.stripe.com',
      'challenges.cloudflare.com',
      
      // Monitoring and logging
      'rum.browser-intake-datadoghq.com',
      'o33249.ingest.sentry.io',
      'o207216.ingest.sentry.io',
      
      // WorkOS authentication
      'setup.workos.com',
      'forwarder.workos.com',
      'workos.imgix.net',
      'cdn.workos.com',
      'images.workoscdn.com',
      
      // LaunchDarkly feature flags
      'events.launchdarkly.com',
      'clientstream.launchdarkly.com',
      'app.launchdarkly.com'
    ];

    const openaiListPayload = {
      name: 'OpenAI Infrastructure Domains',
      description: 'Complete list of OpenAI required domains including core services, analytics, CDN, and third-party integrations.',
      type: 'DOMAIN',
      items: openaiDomains.map(domain => ({ value: domain }))
    };

    const openaiListResponse = await api.post(`/accounts/${accountId}/gateway/lists`, openaiListPayload);
    const openaiListId = openaiListResponse.data.result.id;
    console.log(`✅ Created OpenAI Infrastructure List: ${openaiListId} (${openaiDomains.length} domains)`);

    // 3. Create Critical Infrastructure List
    console.log('\n🏗️ Creating Critical Infrastructure List...');
    
    const criticalDomains = [
      // SimpleMDM
      'simplemdm.com',
      'a.simplemdm.com',
      'api.simplemdm.com',
      
      // Anthropic/Claude
      'api.anthropic.com',
      'console.anthropic.com',
      'claude.ai',
      
      // Warp.dev
      'warp.dev',
      'api.warp.dev',
      'releases.warp.dev',
      
      // Pulsedive Security
      'pulsedive.com',
      'api.pulsedive.com',
      
      // Certificate Transparency
      'crt.sh'
    ];

    const criticalListPayload = {
      name: 'Critical Infrastructure Domains',
      description: 'Essential domains for core business operations including MDM, AI services, and security tools.',
      type: 'DOMAIN',
      items: criticalDomains.map(domain => ({ value: domain }))
    };

    const criticalListResponse = await api.post(`/accounts/${accountId}/gateway/lists`, criticalListPayload);
    const criticalListId = criticalListResponse.data.result.id;
    console.log(`✅ Created Critical Infrastructure List: ${criticalListId} (${criticalDomains.length} domains)`);

    console.log('\n📊 Gateway Lists Summary:');
    console.log(`   • Certificate Infrastructure: $${certListId} (${certDomains.length} domains)`);
    console.log(`   • OpenAI Infrastructure: $${openaiListId} (${openaiDomains.length} domains)`);
    console.log(`   • Critical Infrastructure: $${criticalListId} (${criticalDomains.length} domains)`);
    
    console.log('\n🎯 Next Steps:');
    console.log('   1. Update DNS rules to use: dns.fqdn in $' + certListId);
    console.log('   2. Update HTTP rules to use: http.request.host in $' + openaiListId);
    console.log('   3. Update TLS bypass rules to use: http.conn.hostname in $' + certListId);
    console.log('   4. Test updated rules before deleting originals');
    
    return {
      certificateListId: certListId,
      openaiListId: openaiListId,
      criticalListId: criticalListId,
      totalDomains: certDomains.length + openaiDomains.length + criticalDomains.length
    };
    
  } catch (error) {
    console.error('❌ Error creating Gateway Lists:', error);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

createOptimizedGatewayLists();
