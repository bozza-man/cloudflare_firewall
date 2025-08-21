#!/usr/bin/env node

/**
 * Create Cloudflare Gateway allow rules for Worker and AI services
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052';
const API_TOKEN = '3SE8LCM85RIEclGy-D9kT0m9msY2ovdMVagCigAG';

const GATEWAY_API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`;

// Critical domains that must be allowed
const CRITICAL_DOMAINS = [
  'cloudflare-firewall-manager.bruteforce.workers.dev',
  'gateway.ai.cloudflare.com',
  'api.cloudflare.com',
  'workers.cloudflare.com',
  'ai.cloudflare.com'
];

async function createAllowRule(domains, name, traffic = 'http') {
  const domainList = domains.map(d => `"${d}"`).join(', ');
  const filter = traffic === 'http' 
    ? `http.host in {${domainList}}`
    : `dns.query_name in {${domainList}}`;

  const rule = {
    name,
    description: `Allow access to Cloudflare Worker and AI services`,
    action: 'allow',
    enabled: true,
    precedence: 1,
    traffic,
    filters: [filter],
    rule_settings: {}
  };

  try {
    const response = await axios.post(GATEWAY_API_URL, rule, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log(`✅ Created ${traffic} allow rule: ${name}`);
      return response.data.result;
    } else {
      console.error(`⚠️  Failed to create rule:`, response.data.errors);
      return null;
    }
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(`⚠️  Rule already exists: ${name}`);
    } else {
      console.error(`❌ Error creating rule:`, error.response?.data || error.message);
    }
    return null;
  }
}

async function main() {
  console.log('\n🔧 Setting up Cloudflare Gateway Allow Rules for Worker\n');
  
  // Create HTTP allow rule
  console.log('Creating HTTP allow rule...');
  await createAllowRule(
    CRITICAL_DOMAINS,
    'Allow Cloudflare Worker and AI Services - HTTP',
    'http'
  );
  
  // Create DNS allow rule
  console.log('\nCreating DNS allow rule...');
  await createAllowRule(
    CRITICAL_DOMAINS,
    'Allow Cloudflare Worker and AI Services - DNS',
    'dns'
  );
  
  console.log('\n✨ Firewall configuration complete!');
  console.log('\nYour Worker can now:');
  console.log('  • Access Cloudflare AI Gateway');
  console.log('  • Communicate with Workers AI');
  console.log('  • Connect to all Cloudflare services');
  
  console.log('\n⚠️  Note: Changes may take up to 60 seconds to propagate.\n');
}

main().catch(error => {
  console.error('Script failed:', error);
  process.exit(1);
});
