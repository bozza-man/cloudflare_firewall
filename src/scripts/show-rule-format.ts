#!/usr/bin/env tsx

import { GatewayClient } from '../api/gateway-client.js';

async function showRuleFormats() {
  const gateway = new GatewayClient();
  
  try {
    const rules = await gateway.listGatewayRules();
    
    // Find HTTP and DNS rules to see their format
    const httpRules = rules.filter(r => r.filters?.includes('http'));
    const dnsRules = rules.filter(r => r.filters?.includes('dns'));
    
    console.log('=== HTTP Rules ===');
    httpRules.slice(0, 3).forEach(rule => {
      console.log(`\nRule: ${rule.name}`);
      console.log(`Filters: ${JSON.stringify(rule.filters)}`);
      console.log(`Traffic: ${rule.traffic}`);
      console.log(`Action: ${rule.action}`);
    });
    
    console.log('\n=== DNS Rules ===');
    dnsRules.slice(0, 3).forEach(rule => {
      console.log(`\nRule: ${rule.name}`);
      console.log(`Filters: ${JSON.stringify(rule.filters)}`);
      console.log(`Traffic: ${rule.traffic}`);
      console.log(`Action: ${rule.action}`);
    });
    
    // Look for rules that use lists
    console.log('\n=== Rules using Lists ===');
    const listRules = rules.filter(r => r.traffic?.includes('$'));
    listRules.slice(0, 3).forEach(rule => {
      console.log(`\nRule: ${rule.name}`);
      console.log(`Filters: ${JSON.stringify(rule.filters)}`);
      console.log(`Traffic: ${rule.traffic}`);
      console.log(`Action: ${rule.action}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

showRuleFormats();
