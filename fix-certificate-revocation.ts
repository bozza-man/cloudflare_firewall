#!/usr/bin/env npx tsx
import axios from 'axios';
import { config } from './src/utils/config.js';

async function fixCertificateRevocation() {
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
    console.log('🔐 Adding comprehensive certificate revocation checking support...');
    
    // Comprehensive list of OCSP responders and CRL servers
    const revocationDomains = [
      // Major Certificate Authority OCSP responders
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
      'ocsp.trust-provider.com',
      
      // Let's Encrypt OCSP
      'ocsp.letsencrypt.org',
      'r3.o.lencr.org',
      'r4.o.lencr.org', 
      'e1.o.lencr.org',
      'e2.o.lencr.org',
      'x1.o.lencr.org',
      'x2.o.lencr.org',
      
      // Certificate Revocation Lists (CRL)
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
      
      // Additional CA validation endpoints
      'cacerts.digicert.com', 
      'secure.globalsign.com',
      'apps.identrust.com',
      'letsencrypt.org',
      'isrg.trustid.ocsp.identrust.com',
      'ocsp.int-x3.letsencrypt.org',
      
      // Microsoft/Windows certificate services
      'ocsp.msocsp.com',
      'crl.microsoft.com',
      'mscrl.microsoft.com',
      'ocsp.rootca.microsoft.com',
      
      // Apple certificate services  
      'ocsp.apple.com',
      'ocsp2.apple.com',
      'crl.apple.com',
      'ocsp-lb.apple.com.akadns.net',
      'crl-lb.apple.com.akadns.net',
      
      // Google certificate services
      'ocsp.pki.goog',
      'crl.pki.goog',
      'pki.goog',
      
      // Additional common OCSP/CRL services
      'status.rapidssl.com',
      'ocsp.rapidssl.com',
      'crl.rapidssl.com',
      'ocsp.ssl.com',
      'crl.ssl.com'
    ];
    
    // Create a high-priority DNS rule for certificate revocation checking
    const revocationDNSRule = {
      name: 'Certificate: OCSP and CRL Infrastructure (DNS)',
      description: 'Critical: Allow DNS resolution for OCSP responders and CRL servers. Required for certificate revocation checking and browser security.',
      action: 'allow',
      enabled: true,
      precedence: 1153, // Very high priority, before security blocks
      filters: ['dns'],
      traffic: revocationDomains.map(domain => `dns.fqdn == "${domain}"`).join(' or ')
    };
    
    console.log('Creating DNS rule for certificate revocation services...');
    const dnsResponse = await api.post(`/accounts/${accountId}/gateway/rules`, revocationDNSRule);
    console.log(`✅ Created DNS rule: ${dnsResponse.data.result.name} (precedence: ${dnsResponse.data.result.precedence})`);
    
    // Create HTTP rule for OCSP/CRL access
    const revocationHTTPRule = {
      name: 'Certificate: OCSP and CRL Infrastructure (HTTP)',
      description: 'Critical: Allow HTTPS access to OCSP responders and CRL servers for certificate revocation validation.',
      action: 'allow',
      enabled: true,
      precedence: 1154,
      filters: ['http'],
      traffic: revocationDomains.map(domain => `http.request.host == "${domain}"`).join(' or ')
    };
    
    console.log('Creating HTTP rule for certificate revocation services...');
    const httpResponse = await api.post(`/accounts/${accountId}/gateway/rules`, revocationHTTPRule);
    console.log(`✅ Created HTTP rule: ${httpResponse.data.result.name} (precedence: ${httpResponse.data.result.precedence})`);
    
    // Create TLS bypass rule for certificate revocation services
    const revocationTLSBypassRule = {
      name: 'Certificate: OCSP/CRL TLS Bypass',
      description: 'Critical: Bypass TLS inspection for certificate revocation checking to prevent validation loops.',
      action: 'off',
      enabled: true,
      precedence: 1155,
      filters: ['http'], 
      traffic: revocationDomains.map(domain => `http.conn.hostname == "${domain}"`).join(' or ')
    };
    
    console.log('Creating TLS bypass rule for certificate revocation services...');
    const tlsResponse = await api.post(`/accounts/${accountId}/gateway/rules`, revocationTLSBypassRule);
    console.log(`✅ Created TLS bypass rule: ${tlsResponse.data.result.name} (precedence: ${tlsResponse.data.result.precedence})`);
    
    console.log('\n🎉 Certificate revocation infrastructure rules created successfully!');
    console.log('This should resolve the net::ERR_CERT_NO_REVOCATION_MECHANISM error.');
    console.log('\n⚠️  Note: You may need to restart your browser or wait a few minutes for the changes to take effect.');
    
  } catch (error) {
    console.error('❌ Error creating certificate revocation rules:', error);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

fixCertificateRevocation();
