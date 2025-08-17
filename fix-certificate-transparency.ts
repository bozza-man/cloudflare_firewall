#!/usr/bin/env npx tsx
import { GatewayClient } from './src/api/gateway-client.js';

async function fixCertificateTransparency() {
  try {
    const client = new GatewayClient();
    
    // Certificate transparency and validation domains
    const certTransparencyDomains = [
      // Certificate Transparency Logs
      'crt.sh',
      'ct.googleapis.com',
      'ct.cloudflare.com',
      'ct1.digicert-ct.com',
      'ct2.digicert-ct.com',
      'ctlog.api.venafi.com',
      'ctlog-gen2.api.venafi.com',
      'ct.ws.symantec.com',
      'vega.ws.symantec.com',
      'sirius.ws.symantec.com',
      
      // OCSP (Online Certificate Status Protocol) responders  
      'ocsp.digicert.com',
      'ocsp.sectigo.com',
      'ocsp.globalsign.com',
      'ocsp.entrust.net',
      'ocsp.apple.com',
      'ocsp.godaddy.com',
      'ocsp.comodoca.com',
      'ocsp.thawte.com',
      'ocsp.verisign.com',
      'ocsp.symantec.com',
      'ocsp2.globalsign.com',
      'ocsp.identrust.com',
      'ocsp.letsencrypt.org',
      'r3.o.lencr.org',
      'r4.o.lencr.org',
      'e1.o.lencr.org',
      'e2.o.lencr.org',
      
      // Certificate Revocation Lists (CRL)
      'crl.digicert.com',
      'crl.sectigo.com', 
      'crl.globalsign.com',
      'crl.entrust.net',
      'crl.apple.com',
      'crl.godaddy.com',
      'crl.comodoca.com',
      'crl.thawte.com',
      'crl.verisign.com',
      'crl.symantec.com',
      'crl3.digicert.com',
      'crl4.digicert.com',
      'crl.identrust.com',
      'crl.letsencrypt.org',
      
      // Certificate Authority validation endpoints
      'cacerts.digicert.com',
      'secure.globalsign.com',
      'apps.identrust.com',
      'letsencrypt.org',
      'isrg.trustid.ocsp.identrust.com'
    ];
    
    console.log('🔐 Creating comprehensive certificate transparency and validation rules...');
    
    // Create DNS allow rule
    const dnsRule = await client.createGatewayRule({
      name: 'Certificate: SSL/TLS Validation Infrastructure (DNS)',
      description: 'Allow certificate transparency logs, OCSP responders, and CRL endpoints for proper SSL/TLS certificate validation. Critical for certificate monitoring and security.',
      action: 'allow',
      enabled: true,
      precedence: 1155, // After existing cert rules but before security blocks
      traffic: 'dns',
      filters: certTransparencyDomains.map(domain => `dns.fqdn == "${domain}"`).join(' or ')
    });
    
    console.log(`✅ Created DNS rule: ${dnsRule.name} (precedence: ${dnsRule.precedence})`);
    
    // Create HTTP allow rule 
    const httpRule = await client.createGatewayRule({
      name: 'Certificate: SSL/TLS Validation Infrastructure (HTTP)',
      description: 'Allow HTTPS access to certificate transparency logs, OCSP responders, and CRL endpoints. Essential for certificate validation and monitoring tools.',
      action: 'allow',
      enabled: true,
      precedence: 1156, // Right after DNS rule
      filters: ['http'],
      traffic: certTransparencyDomains.map(domain => `http.request.host == "${domain}"`).join(' or ')
    });
    
    console.log(`✅ Created HTTP rule: ${httpRule.name} (precedence: ${httpRule.precedence})`);
    
    // Also create a rule to allow any subdomain of major CT providers
    const ctProviderRule = await client.createGatewayRule({
      name: 'Certificate: Major CT Provider Subdomains',
      description: 'Allow all subdomains of major certificate transparency providers for comprehensive certificate validation coverage.',
      action: 'allow', 
      enabled: true,
      precedence: 1157,
      filters: ['dns'],
      traffic: [
        'dns.fqdn ~ "*\\.digicert\\.com"',
        'dns.fqdn ~ "*\\.sectigo\\.com"',
        'dns.fqdn ~ "*\\.globalsign\\.com"',
        'dns.fqdn ~ "*\\.entrust\\.net"',
        'dns.fqdn ~ "*\\.letsencrypt\\.org"',
        'dns.fqdn ~ "*\\.lencr\\.org"',
        'dns.fqdn ~ "*\\.identrust\\.com"',
        'dns.fqdn ~ "*\\.googleapis\\.com"',
        'dns.fqdn ~ "*\\.cloudflare\\.com"'
      ].join(' or ')
    });
    
    console.log(`✅ Created CT provider rule: ${ctProviderRule.name} (precedence: ${ctProviderRule.precedence})`);
    
    console.log('\\n🎯 Certificate transparency infrastructure rules created successfully!');
    console.log('These rules should resolve certificate validation and transparency lookup issues.');
    
  } catch (error) {
    console.error('❌ Error creating certificate transparency rules:', error);
  }
}

fixCertificateTransparency();
