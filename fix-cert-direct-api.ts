#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from './src/utils/config.js';

async function createCertificateRulesDirect() {
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
  
  const api = axios.create({
    baseURL,
    headers
  });

  try {
    console.log('🔐 Creating certificate transparency rule using direct API...');
    
    // Certificate transparency and validation domains
    const certDomains = [
      'crt.sh',
      'ct.googleapis.com',
      'ct.cloudflare.com',
      'ocsp.digicert.com',
      'ocsp.letsencrypt.org',
      'crl.digicert.com',
      'crl.letsencrypt.org',
      'r3.o.lencr.org',
      'r4.o.lencr.org'
    ];
    
    const payload = {
      name: 'Certificate: SSL/TLS Validation Services',
      description: 'Allow access to certificate transparency logs, OCSP responders, and CRL endpoints for SSL/TLS validation.',
      action: 'allow',
      enabled: true,
      precedence: 1158,
      filters: ['dns'],
      traffic: certDomains.map(domain => `dns.fqdn == "${domain}"`).join(' or ')
    };
    
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await api.post(`/accounts/${accountId}/gateway/rules`, payload);
    
    console.log('✅ Successfully created DNS certificate transparency rule:', response.data.result.name);
    
    // Also create HTTP rule
    const httpPayload = {
      name: 'Certificate: SSL/TLS Validation Services (HTTP)',
      description: 'Allow HTTPS access to certificate transparency logs, OCSP responders, and CRL endpoints.',
      action: 'allow',
      enabled: true,
      precedence: 1159,
      filters: ['http'],
      traffic: certDomains.map(domain => `http.request.host == "${domain}"`).join(' or ')
    };
    
    const httpResponse = await api.post(`/accounts/${accountId}/gateway/rules`, httpPayload);
    console.log('✅ Successfully created HTTP certificate transparency rule:', httpResponse.data.result.name);
    
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

createCertificateRulesDirect();
