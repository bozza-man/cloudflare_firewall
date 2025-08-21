#!/usr/bin/env node

/**
 * Create Cloudflare Gateway allow rules for Worker and AI services
 * This ensures the Worker can communicate with all necessary Cloudflare services
 */

const axios = require('axios');
const chalk = require('chalk');
require('dotenv').config();

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '0b0ee2b5eaf1fb8a2612e40ab6488052';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '3SE8LCM85RIEclGy-D9kT0m9msY2ovdMVagCigAG';

const GATEWAY_API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/gateway/rules`;

// Define the domains that need to be allowed
const ALLOWED_DOMAINS = [
  // Worker domain
  'cloudflare-firewall-manager.bruteforce.workers.dev',
  '*.bruteforce.workers.dev',
  
  // Cloudflare AI and API services
  'gateway.ai.cloudflare.com',
  'api.cloudflare.com',
  'workers.cloudflare.com',
  '*.workers.dev',
  
  // AI models endpoints
  'ai.cloudflare.com',
  '*.ai.cloudflare.com',
  
  // Analytics and monitoring
  'analytics.cloudflare.com',
  '*.analytics.cloudflare.com',
  
  // R2 storage
  '*.r2.cloudflarestorage.com',
  
  // D1 database
  'd1.cloudflare.com',
  '*.d1.cloudflare.com',
  
  // KV storage
  'kv.cloudflare.com',
  '*.kv.cloudflare.com'
];

async function createAllowRule(domain, precedence) {
  const rule = {
    name: `Allow Cloudflare Worker - ${domain}`,
    description: `Allow access to ${domain} for Cloudflare Worker and AI services`,
    action: 'allow',
    enabled: true,
    precedence: precedence,
    traffic: 'dns',
    filters: [`dns.query_name in {${domain}}`],
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
      console.log(chalk.green(`✅ Created allow rule for: ${domain}`));
      return response.data.result;
    } else {
      console.error(chalk.yellow(`⚠️  Failed to create rule for ${domain}:`, response.data.errors));
      return null;
    }
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(chalk.yellow(`⚠️  Rule already exists for: ${domain}`));
    } else {
      console.error(chalk.red(`❌ Error creating rule for ${domain}:`, error.message));
    }
    return null;
  }
}

async function createHTTPAllowRules() {
  // Create HTTP allow rules for Worker and AI services
  const httpRule = {
    name: 'Allow Cloudflare Worker HTTP Traffic',
    description: 'Allow HTTP/HTTPS traffic to Cloudflare Worker and AI services',
    action: 'allow',
    enabled: true,
    precedence: 1,
    traffic: 'http',
    filters: [
      'http.host in {"cloudflare-firewall-manager.bruteforce.workers.dev", "gateway.ai.cloudflare.com", "api.cloudflare.com", "workers.cloudflare.com", "ai.cloudflare.com"}'
    ],
    rule_settings: {}
  };

  try {
    const response = await axios.post(GATEWAY_API_URL, httpRule, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log(chalk.green('✅ Created HTTP allow rule for Worker and AI services'));
      return response.data.result;
    }
  } catch (error) {
    if (error.response?.status === 409) {
      console.log(chalk.yellow('⚠️  HTTP allow rule already exists'));
    } else {
      console.error(chalk.red('❌ Error creating HTTP rule:', error.message));
    }
  }
}

async function listExistingRules() {
  try {
    const response = await axios.get(GATEWAY_API_URL, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      return response.data.result || [];
    }
    return [];
  } catch (error) {
    console.error(chalk.red('Error fetching existing rules:', error.message));
    return [];
  }
}

async function main() {
  console.log(chalk.bold.blue('\n🔧 Setting up Cloudflare Gateway Allow Rules for Worker\n'));
  
  // Get existing rules to determine precedence
  const existingRules = await listExistingRules();
  console.log(chalk.cyan(`Found ${existingRules.length} existing rules\n`));
  
  // Start with precedence 1 for critical allows
  let precedence = 1;
  
  // Create HTTP allow rule first (highest priority)
  console.log(chalk.bold('Creating HTTP allow rules...'));
  await createHTTPAllowRules();
  
  // Create DNS allow rules
  console.log(chalk.bold('\nCreating DNS allow rules...'));
  for (const domain of ALLOWED_DOMAINS) {
    await createAllowRule(domain, precedence);
    precedence++;
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(chalk.bold.green('\n✨ Firewall rules configuration complete!\n'));
  console.log(chalk.cyan('Your Worker should now be able to:'));
  console.log('  • Communicate with Cloudflare AI Gateway');
  console.log('  • Access Workers AI models');
  console.log('  • Connect to D1, R2, and KV services');
  console.log('  • Send telemetry to Analytics Engine');
  
  console.log(chalk.yellow('\n⚠️  Note: Changes may take up to 60 seconds to propagate.'));
  
  // Test connectivity
  console.log(chalk.bold.blue('\n🧪 Testing Worker connectivity...\n'));
  
  try {
    const testResponse = await axios.get('https://cloudflare-firewall-manager.bruteforce.workers.dev/health', {
      headers: {
        'Host': 'cloudflare-firewall-manager.bruteforce.workers.dev'
      },
      timeout: 10000
    });
    
    if (testResponse.status === 200) {
      console.log(chalk.green('✅ Worker is accessible and responding!'));
      console.log(chalk.gray(JSON.stringify(testResponse.data, null, 2)));
    }
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log(chalk.yellow('⚠️  DNS resolution issue (this is expected initially)'));
      console.log(chalk.cyan('The Worker is deployed but may need DNS propagation time.'));
      console.log(chalk.cyan('You can test using: curl --resolve flag as shown in the deployment summary.'));
    } else {
      console.log(chalk.yellow('⚠️  Could not reach Worker:', error.message));
    }
  }
}

// Run the script
main().catch(error => {
  console.error(chalk.red('Script failed:', error));
  process.exit(1);
});
