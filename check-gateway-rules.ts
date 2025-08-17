#!/usr/bin/env npx tsx
import { GatewayClient } from './src/api/gateway-client.js';

async function checkGatewayRules() {
  try {
    const client = new GatewayClient();
    const rules = await client.listGatewayRules();
    
    // Separate rules by type based on filters
    const dnsRules = rules.filter(rule => rule.filters.includes('dns'));
    const httpRules = rules.filter(rule => rule.filters.includes('http'));
    const l4Rules = rules.filter(rule => rule.filters.includes('l4'));
    
    console.log('🔍 DNS Rules:');
    dnsRules
      .sort((a, b) => a.precedence - b.precedence)
      .forEach(rule => {
        console.log(`  ${rule.precedence.toString().padStart(5)}: ${rule.name} (${rule.action}) ${rule.enabled ? '✅' : '❌'}`);
      });
    
    console.log('\n🌐 HTTP Rules:');
    httpRules
      .sort((a, b) => a.precedence - b.precedence)
      .forEach(rule => {
        console.log(`  ${rule.precedence.toString().padStart(5)}: ${rule.name} (${rule.action}) ${rule.enabled ? '✅' : '❌'}`);
      });

    console.log('\n🌊 L4 Rules:');
    l4Rules
      .sort((a, b) => a.precedence - b.precedence)
      .forEach(rule => {
        console.log(`  ${rule.precedence.toString().padStart(5)}: ${rule.name} (${rule.action}) ${rule.enabled ? '✅' : '❌'}`);
      });

    // Look for specific blocking rules that might affect HTTPS
    console.log('\n🚫 Rules that might block HTTPS connections:');
    rules
      .filter(rule => rule.action === 'block' && rule.enabled)
      .sort((a, b) => a.precedence - b.precedence)
      .forEach(rule => {
        console.log(`  ${rule.precedence.toString().padStart(5)}: ${rule.name} [${rule.filters.join(', ')}]`);
        if (rule.traffic) {
          console.log(`        Traffic: ${rule.traffic.substring(0, 100)}...`);
        }
      });

  } catch (error) {
    console.error('❌ Error listing Gateway rules:', error);
  }
}

checkGatewayRules();
